FROM node:22-alpine

WORKDIR /repo
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY apps/realtime/package.json apps/realtime/

RUN npm install

COPY packages/db packages/db
COPY packages/types packages/types
COPY apps/realtime apps/realtime

RUN npm run generate --workspace=@interviewhub/db

WORKDIR /repo/apps/realtime
EXPOSE 4000
CMD ["npm", "run", "start"]
