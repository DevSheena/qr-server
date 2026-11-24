# 本番用のイメージ。中身は bin/build.sh で作った実行ファイル 1 つだけ (画面のファイルは中に埋め込んである)。
# ビルド (重い処理) は bin/build.sh が上限つきのコンテナで済ませるので、ここではコピーだけする。作るのは bin/image.sh。
FROM gcr.io/distroless/static-debian13:nonroot
# docker build --platform linux/<CPU> の CPU (BuildKit が入れる)
ARG TARGETARCH
COPY build/linux-${TARGETARCH}/qr-server /qr-server
# 既定では :8080 で待つ (起動オプションは docker run のイメージ名の後ろに書く。例: -addr :8443 -cert ... -key ...)
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/qr-server"]
