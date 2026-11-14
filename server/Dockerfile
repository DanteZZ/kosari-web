FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./
ENV PORT=5181
EXPOSE 5181
CMD ["node", "index.mjs"]
