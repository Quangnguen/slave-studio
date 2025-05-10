from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer

# Cấu hình user: anonymous, cho phép truy cập đầy đủ
authorizer = DummyAuthorizer()
authorizer.add_anonymous("D:/test", perm='elr')  # e: cd, l: list, r: read


# Tạo handler FTP
handler = FTPHandler
handler.authorizer = authorizer

# Khởi tạo server FTP
server = FTPServer(("0.0.0.0", 2121), handler)

print("Đang chạy FTP server trên cổng 2121, thư mục chia sẻ: D:/test")
server.serve_forever()
