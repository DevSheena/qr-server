# 本番用のイメージ。中身は bin/build.sh で作った実行ファイル 1 つだけ (画面のファイルは中に埋め込んである)。
# ビルド (重い処理) は bin/build.sh が上限つきのコンテナで済ませるので、ここではコピーだけする。作るのは bin/image.sh。
FROM gcr.io/distroless/static-debian13:nonroot
# docker build --platform linux/<CPU> の CPU (BuildKit が入れる)
ARG TARGETARCH
COPY build/linux-${TARGETARCH}/qr-server /qr-server
# 既定では HTTPS の :8443 で待つ (-http なら :8080)。起動オプションは docker run のイメージ名の後ろに書く。
# この中には証明書を自動で作れない (実行ファイルの隣に書き込めない) ので、HTTPS は -cert・-key で渡す (bin/serve.sh)
EXPOSE 8443 8080
USER nonroot
ENTRYPOINT ["/qr-server"]
