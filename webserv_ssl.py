import http.server
import ssl


def get_ssl_context(certfile, keyfile):
    context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
    # https://stackoverflow.com/a/73570973/1933185
    # context = ssl.SSLContext( ssl.PROTOCOL_TLS_CLIENT )
    # context.minimum_version = ssl.TLSVersion.TLSv1_2
    # context.maximum_version = ssl.TLSVersion.TLSv1_3
    context.load_cert_chain(certfile, keyfile)
    context.set_ciphers("@SECLEVEL=1:ALL")
    return context


class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers["Content-Length"])
        post_data = self.rfile.read(content_length)
        print(post_data.decode("utf-8"))


server_address = ("127.0.0.1", 8008)
httpd = http.server.HTTPServer(server_address, MyHandler)

context = get_ssl_context("cert.pem", "key.pem")
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

httpd.serve_forever()

# The cert.pem and key.pem are created using this command:
# 
#    openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem
#
# NOTE: Don't forget to set Common Name (e.g. server FQDN or YOUR name) [] to 127.0.0.1 !
# NOTE: Don't forget to set Common Name (e.g. server FQDN or YOUR name) [] to localhost !
#
# Running this script will create server running on 127.0.0.1:8008.
# To test it you can send from other terminal this command:
# 
#    curl --cacert cert.pem -X POST -d "param1=value1&param2=value2" https://127.0.0.1:8008
#    curl --cacert cert.pem -X POST -d "param1=value1&param2=value2" https://localhost:8008

# Quelle: https://stackoverflow.com/a/77512705/1933185
