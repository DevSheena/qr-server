# 本番用のイメージ。中身は bin/build.sh で作った実行ファイル 1 つだけ (画面のファイルは中に埋め込んである)。
# ビルド (重い処理) は bin/build.sh が上限つきのコンテナで済ませるので、ここではコピーだけする。作るのは bin/image.sh。
FROM gcr.io/distroless/static-debian13:nonroot
# docker build --platform linux/<CPU> の CPU (BuildKit が入れる)
ARG TARGETARCH
COPY build/linux-${TARGETARCH}/qr-server /qr-server
# 待ち受けるポート。Cloud Run などは PORT を自分で決めて渡す
ENV PORT=8080
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/qr-server"]
