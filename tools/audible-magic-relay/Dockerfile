# Mount Audible Magic's Toolkit (from your Audible Magic account) at /opt/audiblemagic
FROM node:20-slim
WORKDIR /app
COPY server.mjs .
ENV PORT=8787 AM_IDENTIFY_BIN=/opt/audiblemagic/identify AM_CONFIG=/opt/audiblemagic/config.cfg
EXPOSE 8787
USER node
CMD ["node", "server.mjs"]
