FROM nginx:1.27-alpine
RUN apk add --no-cache openssl librsvg
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY docker/frontend/ /usr/share/nginx/html/
RUN rsvg-convert /usr/share/nginx/html/icon.svg -w 192 -h 192 -o /usr/share/nginx/html/icon-192.png && \
    rsvg-convert /usr/share/nginx/html/icon.svg -w 512 -h 512 -o /usr/share/nginx/html/icon-512.png
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
