#!/usr/bin/env python3
"""No-cache static server for rendered display images (LAN prototype).
Roku Posters honor cache headers, so no-store keeps refreshes honest."""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"serving {os.getcwd()} on 0.0.0.0:{port}")
    http.server.ThreadingHTTPServer(("0.0.0.0", port), NoCacheHandler).serve_forever()
