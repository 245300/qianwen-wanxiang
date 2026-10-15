"""Local static server + LLM proxy (127.0.0.1 only).

Two jobs
--------
1. Serve the static site with ``Cache-Control: no-store``.
   Plain ``python -m http.server`` sends no cache headers, so browsers
   heuristically cache index.html and keep showing the old page (stale ``?v=``
   script references) after the site is updated. serve.ps1 prefers this wrapper
   and falls back to plain http.server when the file is missing.

2. Proxy model requests to upstream gateways (three relays):
   * ``/api/llm/chat``      — LLM chat (magpie gateway or a custom
     OpenAI-compatible endpoint, SSE streaming).
   * ``/api/media/relay``   — image / video generation. Two upstream
     dialects: the project's original Agnes platform (``/v1/images/generations``,
     ``/v1/videos``, ``/agnesapi``) and Alibaba Bailian (DashScope, whose
     image and video endpoints are *not* OpenAI-shaped — see below).

Why the proxy exists (2026-10-13)
---------------------------------
The local magpie gateway (``127.0.0.1:3425``) sends **no CORS headers** and
answers the ``OPTIONS`` preflight with 404, so a browser page cannot call it
directly. magpie's own integration guide says a web front-end must go through
its own back end; this file is that back end. Routing everything through one
proxy also gives a single code path for both the magpie gateway and any custom
OpenAI-compatible endpoint.

Security posture (SSRF guard)
-----------------------------
* Only ``http``/``https`` upstreams, and no credentials embedded in the URL.
* **Custom** upstreams (user-supplied) must resolve to public addresses only:
  loopback, private, link-local, reserved, multicast and unspecified addresses
  are rejected — for the literal host *and* for every address it resolves to
  (DNS-rebinding guard). Redirect hops are re-validated the same way.
* The **magpie** upstream is *not* user-supplied: the server probes the fixed
  loopback address and requires ``/api/hello`` to answer ``name == "magpie"``.
  That identity check is what makes the single loopback exception safe — it is
  not a general "loopback is allowed" rule.
* Proxy endpoints accept same-origin requests only, so an unrelated web page
  cannot use this server as an open proxy.
* ``/api/media/relay`` applies the same validation as the custom LLM upstream
  (public http/https only, re-validated on every redirect); only the host is
  user-supplied — the request path itself is a same-origin page-provided
  relative path, so this is a connection relay, not an arbitrary-destination
  fetch.

DashScope (Bailian) protocol notes
----------------------------------
Bailian's image/video endpoints are DashScope-native, not OpenAI-shaped, and
that difference is why the relay cannot just forward them blindly:

* **Image** — ``POST /api/v1/services/aigc/multimodal-generation/generation``.
  The image goes in ``input.messages[].content[]`` with the ``image`` key set
  to a **data URI** (``data:image/png;base64,...``); a bare base64 string is
  rejected. Creation is **synchronous**: the answer already carries
  ``output.choices[0].message.content[0].image``.
* **Video** — ``POST /api/v1/services/aigc/video-generation/video-synthesis``
  with header ``X-DashScope-Async: enable``. The reference image is
  ``input.media`` — an **array of objects** ``[{"url": ..., "type":
  "first_frame"}]``; a plain string array is rejected (``type`` must be one of
  first_frame / last_frame / driving_audio / first_clip). Returns
  ``output.task_id`` + ``task_status``; poll ``GET /api/v1/tasks/{task_id}``
  until ``task_status`` is ``SUCCEEDED`` (answer carries ``output.video_url``)
  or ``FAILED`` / ``CANCELED`` (answer carries ``code`` + ``message``).
* Bailian's **OpenAI-compatible** mode (``/compatible-mode/v1``) does *not*
  expose ``/images/generations`` (404), so the generic relay path never works
  for its image models — the two dialect branches below are load-bearing.
* Bailian **does** send permissive CORS headers, so a direct browser call would
  work; the relay is kept anyway for the same reasons as the LLM channel
  (single SSRF-guarded code path, Key never in the page's direct sight).

Usage: ``python _serve.py [port]``   (default 8765, binds 127.0.0.1 only)
"""

import http.server
import ipaddress
import json
import os
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

# Fixed loopback target for the magpie gateway. 3425 is magpie's default;
# its own settings.json can override the port, so we try that first.
MAGPIE_DEFAULT_PORT = 3425
# Attribution key: magpie records usage under this name (loopback needs no
# real credential, but a named key keeps the Usage page readable).
MAGPIE_CALLER = "magpie-qianwenwanxiang"

# Request body cap (chat histories with base64 images are the large case).
MAX_BODY = 32 * 1024 * 1024
# Upstream read timeout: deep-thinking models can take minutes.
UPSTREAM_TIMEOUT = 300

LOCAL_HOSTNAMES = ("127.0.0.1", "localhost", "::1")


# --------------------------------------------------------------------------
# SSRF guard
# --------------------------------------------------------------------------
# RFC 2544 benchmarking range. No real service is reachable there, and it is
# the default "fake-ip" pool of Clash / Mihomo style proxy tools: on a machine
# running such a proxy (fake-ip + TUN mode) EVERY hostname resolves into this
# range, so rejecting it would turn the guard into "reject everything" while
# protecting nothing. The genuine SSRF surface (loopback / RFC1918 / link-local
# / multicast / other reserved ranges) stays blocked exactly as before.
_FAKE_IP_NET = ipaddress.ip_network("198.18.0.0/15")


def _ip_is_forbidden(ip):
    """Loopback / private / link-local / reserved / multicast / unspecified."""
    if ip.version == 4 and ip in _FAKE_IP_NET:
        return False
    return (ip.is_loopback or ip.is_private or ip.is_link_local
            or ip.is_multicast or ip.is_reserved or ip.is_unspecified)


def _hostname_is_forbidden(host):
    """Check the literal host. DNS names return False here (resolved later)."""
    h = (host or "").strip().strip("[]").lower().rstrip(".")
    if not h:
        return True
    if (h in LOCAL_HOSTNAMES or h.endswith(".localhost") or h.endswith(".local")
            or h.endswith(".internal") or h.endswith(".home.arpa")):
        return True
    try:
        ip = ipaddress.ip_address(h)
    except ValueError:
        return False        # a DNS name — _resolve_is_forbidden() covers it
    return _ip_is_forbidden(ip)


def _resolve_is_forbidden(host):
    """Resolve the host and reject it if any address is non-public.

    Guards against a public-looking name that points at an internal address
    (DNS rebinding / attacker-controlled DNS).
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return "主机名无法解析"
    if not infos:
        return "主机名无法解析"
    for info in infos:
        addr = str(info[4][0]).split("%")[0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return "解析出的地址异常"
        if _ip_is_forbidden(ip):
            return "解析到本机/内网/保留地址"
    return None


# Headers a client-supplied header map may never set: they change request
# semantics (host routing, framing, connection handling) rather than carrying
# application data. Content-Type stays ours (we always send JSON).
_FORBIDDEN_HEADERS = {
    "host", "content-length", "connection", "transfer-encoding", "upgrade",
    "te", "trailer", "expect", "proxy-authorization", "proxy-connection",
    "content-type", "cookie", "set-cookie",
}


def _header_name_ok(name):
    """请求头名白名单：常见 HTTP token 字符，且挡掉会改变请求语义的头。"""
    if not (1 <= len(name) <= 64):
        return False
    for i, c in enumerate(name):
        if i == 0:
            if not (c.isascii() and c.isalpha()):
                return False
        elif not (c.isascii() and (c.isalnum() or c == "-")):
            return False
    return name.lower() not in _FORBIDDEN_HEADERS


def _header_value_ok(value, max_len):
    """请求头值：不含控制字符（防 CRLF 注入）且不超长。"""
    if len(value) > max_len:
        return False
    return not any(ord(c) < 0x20 or ord(c) == 0x7f for c in value)


def validate_upstream(raw):
    """Validate a user-supplied upstream base URL.

    Returns ``(ok, base, err)`` where ``base`` is ``scheme://netloc``.
    """
    if not raw or not str(raw).strip():
        return False, None, "请填写接口地址"
    try:
        u = urllib.parse.urlsplit(str(raw).strip())
    except ValueError:
        return False, None, "地址格式不正确"
    if u.scheme not in ("http", "https"):
        return False, None, "仅允许 http/https 地址"
    if u.username or u.password:
        return False, None, "地址中不得包含账号密码"
    host = u.hostname
    if not host:
        return False, None, "地址缺少主机名"
    if _hostname_is_forbidden(host):
        return False, None, "不允许访问本机/内网/保留地址"
    err = _resolve_is_forbidden(host)
    if err:
        return False, None, "不允许访问本机/内网/保留地址（" + err + "）"
    base = "%s://%s" % (u.scheme, u.netloc)
    return True, base, None


class _GuardedRedirect(urllib.request.HTTPRedirectHandler):
    """Re-validate every redirect hop.

    Without this, a public URL could 302 us to a private address and the guard
    on the original URL would be bypassed.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        ok, _base, err = validate_upstream(newurl)
        if not ok:
            raise urllib.error.HTTPError(newurl, code,
                                         "重定向被拒绝：" + (err or ""), headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_GuardedRedirect)


# --------------------------------------------------------------------------
# magpie discovery (fixed loopback target + identity check)
# --------------------------------------------------------------------------
def magpie_base():
    """Return ``(base, version)`` for a verified local magpie gateway.

    The target is never taken from the client: we probe loopback and require
    ``/api/hello`` to identify itself as magpie. Returns ``(None, None)`` when
    magpie is not running.
    """
    ports = []
    cfg = os.path.join(os.path.expanduser("~"), ".config", "magpie", "settings.json")
    try:
        with open(cfg, encoding="utf-8") as f:
            p = json.load(f).get("port")
        if isinstance(p, int) and 1 <= p <= 65535:
            ports.append(p)
    except Exception:
        pass
    ports.append(MAGPIE_DEFAULT_PORT)

    for port in dict.fromkeys(ports):
        base = "http://127.0.0.1:%d" % port
        try:
            with urllib.request.urlopen(base + "/api/hello", timeout=1.5) as r:
                info = json.loads(r.read().decode("utf-8", "replace"))
            if isinstance(info, dict) and info.get("name") == "magpie":
                return base, str(info.get("version") or "")
        except Exception:
            continue
    return None, None


# --------------------------------------------------------------------------
# HTTP handler
# --------------------------------------------------------------------------
class Handler(http.server.SimpleHTTPRequestHandler):

    # HTTP/1.1 so the streaming path can use chunked transfer encoding.
    # Without chunking (or a Content-Length) a 1.1 connection has no way to
    # delimit the body and the browser would buffer the whole answer before
    # showing anything. Static files are unaffected: SimpleHTTPRequestHandler
    # always sends Content-Length for them.
    protocol_version = "HTTP/1.1"

    # ---- static files (unchanged behaviour: no-store on everything) ----
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # keep the launcher console clean; 124+ pattern images would spam it
        pass

    # ---- routing ----
    def do_GET(self):
        if self.path.startswith("/api/llm/"):
            return self._api_get()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/llm/"):
            return self._api_post()
        if self.path.startswith("/api/media/"):
            return self._media_post()
        self.send_error(404, "Not Found")

    def do_OPTIONS(self):
        # Same-origin requests need no preflight; anything else is refused.
        self.send_response(204)
        self.send_header("Allow", "GET, POST")
        self.end_headers()

    # ---- helpers ----
    def _same_origin_ok(self):
        """Reject proxy calls carrying a foreign Origin/Referer.

        Keeps an unrelated web page from using this local server as an open
        proxy. Requests with no such header (curl, scripts) are allowed: they
        are the machine owner's own tools.
        """
        for hdr in ("Origin", "Referer"):
            v = self.headers.get(hdr)
            if not v:
                continue
            try:
                u = urllib.parse.urlsplit(v)
            except ValueError:
                return False
            if u.hostname not in LOCAL_HOSTNAMES:
                return False
        return True

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _err(self, code, message, **extra):
        err = {"message": message}
        err.update(extra)
        self._json(code, {"error": err})

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None, "请求体长度无效"
        if length <= 0:
            return None, "请求体为空"
        if length > MAX_BODY:
            return None, "请求体过大"
        try:
            return json.loads(self.rfile.read(length).decode("utf-8")), None
        except Exception:
            return None, "请求体不是合法 JSON"

    # ---- GET /api/llm/status | /api/llm/models ----
    def _api_get(self):
        if not self._same_origin_ok():
            return self._err(403, "仅允许本机同源页面调用")
        path = self.path.split("?", 1)[0]

        if path == "/api/llm/status":
            base, version = magpie_base()
            return self._json(200, {
                "proxy": True,
                "magpie": {"available": bool(base), "baseUrl": base, "version": version}
            })

        if path == "/api/llm/models":
            return self._magpie_models()

        return self._err(404, "未知接口")

    def _magpie_models(self):
        base, version = magpie_base()
        if not base:
            return self._err(502, "未检测到本机 magpie 网关（请确认 magpie 正在运行）")
        req = urllib.request.Request(base + "/v1/models", method="GET")
        req.add_header("Authorization", "Bearer " + MAGPIE_CALLER)
        req.add_header("User-Agent", "QianwenWanxiang/1.0")
        try:
            with _OPENER.open(req, timeout=20) as r:
                raw = r.read()
        except urllib.error.HTTPError as e:
            return self._err(502, "magpie 返回 HTTP %d" % e.code)
        except Exception as e:
            return self._err(502, "无法连接 magpie：" + str(e))
        try:
            data = json.loads(raw.decode("utf-8", "replace"))
        except Exception:
            return self._err(502, "magpie 返回的不是合法 JSON")
        items = data.get("data") if isinstance(data, dict) else None
        return self._json(200, {
            "object": "list",
            "version": version,
            "count": len(items) if isinstance(items, list) else 0,
            "data": items if isinstance(items, list) else []
        })

    # ---- POST /api/llm/chat ----
    def _api_post(self):
        if not self._same_origin_ok():
            return self._err(403, "仅允许本机同源页面调用")
        path = self.path.split("?", 1)[0]
        if path != "/api/llm/chat":
            return self._err(404, "未知接口")

        payload, err = self._read_json_body()
        if err:
            return self._err(400, err)
        if not isinstance(payload, dict):
            return self._err(400, "请求体必须是 JSON 对象")

        body = payload.get("body")
        if not isinstance(body, dict) or not body.get("model"):
            return self._err(400, "缺少 body.model")

        target = payload.get("target") or "custom"
        if target == "magpie":
            base, _version = magpie_base()
            if not base:
                return self._err(502, "未检测到本机 magpie 网关（请确认 magpie 正在运行）")
            key = MAGPIE_CALLER
        elif target == "custom":
            ok, base, verr = validate_upstream(payload.get("baseUrl"))
            if not ok:
                return self._err(400, verr)
            key = str(payload.get("key") or "").strip()
        else:
            return self._err(400, "target 只能是 magpie 或 custom")

        url = base + "/v1/chat/completions"
        try:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        except (TypeError, ValueError):
            return self._err(400, "body 无法序列化")

        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "QianwenWanxiang/1.0")
        if key:
            req.add_header("Authorization", "Bearer " + key)

        try:
            upstream = _OPENER.open(req, timeout=UPSTREAM_TIMEOUT)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read()[:4000].decode("utf-8", "replace")
            except Exception:
                pass
            return self._err(502, "上游返回 HTTP %d" % e.code,
                             upstreamStatus=e.code, upstreamBody=detail)
        except Exception as e:
            return self._err(502, "无法连接上游：" + str(e))

        self._stream_through(upstream)

    def _stream_through(self, upstream):
        """Relay the upstream response body verbatim, flushing as it arrives.

        Uses HTTP/1.1 chunked transfer encoding so the browser's fetch reader
        receives each SSE event as soon as it is written — with a bare
        connection-close body the page would see the whole answer at once and
        the typewriter effect would be lost.
        """
        ctype = upstream.headers.get("Content-Type") or "application/json"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("X-Proxy-Upstream", "ok")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        def write_chunk(data):
            self.wfile.write(b"%x\r\n" % len(data) + data + b"\r\n")
            self.wfile.flush()

        reader = getattr(upstream, "read1", None) or upstream.read
        try:
            while True:
                chunk = reader(4096)
                if not chunk:
                    break
                write_chunk(chunk)
            # terminator chunk
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass          # the page was closed mid-answer — nothing to do
        except Exception:
            pass
        finally:
            try:
                upstream.close()
            except Exception:
                pass
            # Chunked framing already ended the body; keep the connection
            # usable only when we completed cleanly.
            self.close_connection = True


    # ---- POST /api/media/relay | /api/media/check（图像/视频代理） ----
    # 与大语言模型的 custom 通道同一套安全口径：目标由客户端给出，
    # 这里做完整 SSRF 校验（validate_upstream + 重定向逐跳复验），
    # path/query 只允许站内相对路径，凭据一律走 Authorization 头。
    def _media_post(self):
        if not self._same_origin_ok():
            return self._err(403, "仅允许本机同源页面调用")
        path = self.path.split("?", 1)[0]
        if path == "/api/media/check":
            return self._media_check()
        if path != "/api/media/relay":
            return self._err(404, "未知接口")

        payload, err = self._read_json_body()
        if err:
            return self._err(400, err)
        if not isinstance(payload, dict):
            return self._err(400, "请求体必须是 JSON 对象")

        ok, base, verr = validate_upstream(payload.get("baseUrl"))
        if not ok:
            return self._err(400, verr)

        # ---- DashScope（百炼）专用端点：图像与视频都不是 OpenAI 形状 ----
        # provider 是前端 provider 注册表（config.js MEDIA_PROVIDERS）里的平台 id；
        # dialect 是旧字段名（2026-10-15 重命名为 provider），两者都认，平滑迁移。
        dialect = str(payload.get("provider") or payload.get("dialect") or "").lower()
        if dialect == "dashscope":
            sub = str(payload.get("path") or "")
            # 三个 DashScope 子端点，由前端按需选用：
            #   /.dashscope-image  同步生成图像
            #   /.dashscope-video  异步创建视频任务（带 X-DashScope-Async）
            #   /.dashscope-task   轮询任务状态
            if sub.startswith("/.dashscope-"):
                return self._dashscope_image(base, payload) if sub == "/.dashscope-image" \
                    else self._dashscope_video(base, payload) if sub == "/.dashscope-video" \
                    else self._dashscope_task(base, payload) if sub == "/.dashscope-task" \
                    else self._err(404, "未知 DashScope 端点")

        method = str(payload.get("method") or "GET").upper()
        if method not in ("GET", "POST"):
            return self._err(400, "method 仅支持 GET / POST")

        sub = str(payload.get("path") or "").strip()
        # 防绝对 URL 注入与换行注入：只收站内相对路径（"/v1/..." 这类）
        if not sub.startswith("/") or sub.startswith("//") \
                or any(ord(c) < 0x20 or ord(c) == 0x7f for c in sub):
            return self._err(400, "path 必须是站内相对路径")

        qs = ""
        query = payload.get("query")
        if isinstance(query, dict) and query:
            try:
                qs = "?" + urllib.parse.urlencode(query)
            except Exception:
                return self._err(400, "query 无法编码")
        url = base + sub + qs

        data = None
        body = payload.get("body")
        if method == "POST":
            if body is None:
                body = {}
            if not isinstance(body, dict):
                return self._err(400, "body 必须是 JSON 对象")
            try:
                data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            except (TypeError, ValueError):
                return self._err(400, "body 无法序列化")

        key = str(payload.get("key") or "").strip()

        # ---- 自定义协议模板：可选认证头样式与额外请求头（仅 provider=custom） ----
        # 头名走白名单（见 _header_name_ok，Host/Content-Length 这类一律拒绝），
        # 头值不许含控制字符；其余 provider 的默认行为完全不变。
        auth_header, auth_prefix, extra_headers = "Authorization", "Bearer ", {}
        if dialect == "custom":
            auth = payload.get("auth")
            if isinstance(auth, dict):
                hn = str(auth.get("header") or "").strip()
                if hn:
                    if not _header_name_ok(hn):
                        return self._err(400, "auth.header 不是合法的请求头名")
                    auth_header = hn
                if auth.get("prefix") is not None:
                    auth_prefix = str(auth.get("prefix"))
                    if not _header_value_ok(auth_prefix, 64):
                        return self._err(400, "auth.prefix 含非法字符或过长")
            hs = payload.get("headers")
            if hs is not None:
                if not isinstance(hs, dict):
                    return self._err(400, "headers 必须是 JSON 对象")
                if len(hs) > 8:
                    return self._err(400, "额外请求头最多 8 个")
                for hn2, hv in hs.items():
                    name2 = str(hn2)
                    if not _header_name_ok(name2):
                        return self._err(400, "请求头名不合法：" + name2)
                    sval = str(hv)
                    if not _header_value_ok(sval, 512):
                        return self._err(400, "请求头值不合法：" + name2)
                    extra_headers[name2] = sval

        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("User-Agent", "QianwenWanxiang/1.0")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if key:
            req.add_header(auth_header, auth_prefix + key)
        for hn3, hv3 in extra_headers.items():
            req.add_header(hn3, hv3)

        try:
            upstream = _OPENER.open(req, timeout=UPSTREAM_TIMEOUT)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read()[:4000].decode("utf-8", "replace")
            except Exception:
                pass
            return self._err(502, "上游返回 HTTP %d" % e.code,
                             upstreamStatus=e.code, upstreamBody=detail)
        except Exception as e:
            return self._err(502, "无法连接上游：" + str(e))

        self._relay_buffered(upstream)

    def _media_check(self):
        """Validate a platform address without sending it any request.

        A "test connection" that fires a real request is unreliable here:
        the platform's own landing page is a Next.js app that takes tens of
        seconds, and its API paths answer only to POST/with a body. So the
        check is split in two:
          1. server side: full SSRF validation + a TCP connect to the port
             (proves the host is reachable and is not a blocked address);
          2. page side: `Agnes._relay` may still be used for a real call.
        """
        payload, err = self._read_json_body()
        if err:
            return self._err(400, err)
        if not isinstance(payload, dict):
            return self._err(400, "请求体必须是 JSON 对象")

        ok, base, verr = validate_upstream(payload.get("baseUrl"))
        if not ok:
            return self._err(400, verr)

        u = urllib.parse.urlsplit(base)
        port = u.port or (443 if u.scheme == "https" else 80)
        try:
            with socket.create_connection((u.hostname, port), timeout=8):
                pass
        except OSError as e:
            return self._err(502, "无法连接 %s:%d（%s）" % (u.hostname, port, e))
        return self._json(200, {"ok": True, "base": base, "host": u.hostname, "port": port})

    def _dashscope_task(self, base, payload):
        """Poll a DashScope async task: GET /api/v1/tasks/{task_id}."""
        task_id = str(payload.get("taskId") or "").strip()
        if not task_id:
            return self._err(400, "缺少 taskId")
        # taskId 只做路径段用，且必须是 UUID 形状（DashScope 返回的即 UUID）
        import uuid as _uuid
        try:
            _uuid.UUID(task_id)
        except ValueError:
            return self._err(400, "taskId 格式不正确")

        key = str(payload.get("key") or "").strip()
        req = urllib.request.Request(base + "/api/v1/tasks/" + task_id, method="GET")
        req.add_header("User-Agent", "QianwenWanxiang/1.0")
        if key:
            req.add_header("Authorization", "Bearer " + key)

        try:
            upstream = _OPENER.open(req, timeout=UPSTREAM_TIMEOUT)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read()[:4000].decode("utf-8", "replace")
            except Exception:
                pass
            return self._err(502, "上游返回 HTTP %d" % e.code,
                             upstreamStatus=e.code, upstreamBody=detail)
        except Exception as e:
            return self._err(502, "无法连接上游：" + str(e))

        self._relay_buffered(upstream)

    def _dashscope_video(self, base, payload):
        """Bailian (DashScope) video task creation.

        与图像不同，视频是**异步**的：必须带 ``X-DashScope-Async: enable``
        请求头，上游才会返回 ``output.task_id``；不带这个头会按同步接口处理
        并直接失败。参考图走 ``input.media`` 对象数组（校验已在前端做）。
        """
        body = payload.get("body")
        if not isinstance(body, dict) or not body.get("model"):
            return self._err(400, "缺少 body.model")

        key = str(payload.get("key") or "").strip()
        url = base + "/api/v1/services/aigc/video-generation/video-synthesis"
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                     method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "QianwenWanxiang/1.0")
        req.add_header("X-DashScope-Async", "enable")
        if key:
            req.add_header("Authorization", "Bearer " + key)

        try:
            upstream = _OPENER.open(req, timeout=UPSTREAM_TIMEOUT)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read()[:4000].decode("utf-8", "replace")
            except Exception:
                pass
            return self._err(502, "上游返回 HTTP %d" % e.code,
                             upstreamStatus=e.code, upstreamBody=detail)
        except Exception as e:
            return self._err(502, "无法连接上游：" + str(e))

        self._relay_buffered(upstream)

    def _dashscope_image(self, base, payload):
        """Bailian (DashScope) image generation.

        与 Agnes 的 OpenAI 形状不同：图像走 DashScope 原生
        multimodal-generation 接口，且**同步**返回结果——任务创建与结果获取
        一次完成，没有轮询。
        """
        model = str(payload.get("model") or "").strip()
        if not model:
            return self._err(400, "缺少图像模型名")
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            return self._err(400, "缺少提示词")

        body = payload.get("body")
        if body is not None and not isinstance(body, dict):
            return self._err(400, "body 必须是 JSON 对象")
        body = body or {}

        key = str(payload.get("key") or "").strip()

        url = base + "/api/v1/services/aigc/multimodal-generation/generation"
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                     method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "QianwenWanxiang/1.0")
        if key:
            req.add_header("Authorization", "Bearer " + key)

        try:
            upstream = _OPENER.open(req, timeout=UPSTREAM_TIMEOUT)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read()[:4000].decode("utf-8", "replace")
            except Exception:
                pass
            return self._err(502, "上游返回 HTTP %d" % e.code,
                             upstreamStatus=e.code, upstreamBody=detail)
        except Exception as e:
            return self._err(502, "无法连接上游：" + str(e))

        self._relay_buffered(upstream)

    def _relay_buffered(self, upstream):
        """Relay an upstream response verbatim (status + content-type + body).

        Unlike the SSE path this is fully buffered: image/video APIs return
        plain JSON of bounded size. Cap guards against a misbehaving upstream
        eating the machine's memory.
        """
        cap = 64 * 1024 * 1024
        status = getattr(upstream, "status", 200) or 200
        ctype = upstream.headers.get("Content-Type") or "application/json"
        chunks = []
        total = 0
        try:
            while True:
                raw = upstream.read(65536)
                if not raw:
                    break
                total += len(raw)
                if total > cap:
                    return self._err(502, "上游返回体过大")
                chunks.append(raw)
        finally:
            try:
                upstream.close()
            except Exception:
                pass
        body = b"".join(chunks)
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()
