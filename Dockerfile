# Retold Data Mapper — long-running service.
# Port 8395 by default; serves the cross-beacon mapping web UI + REST
# API at /mapper/*. Connects to an Ultravisor as a beacon when
# DATAMAPPER_ULTRAVISOR_URL is set (or via --ultravisor flag).
#
# `npm install` (not `npm ci`) is intentional — package-lock.json is
# gitignored per the Quackage convention. See BUILDING-AND-PUBLISHING.md.
#
# Note: this module is mid-rewrite (see CLAUDE.md). The Dockerfile
# reflects the current shape; revisit when the Pict-app rewrite lands.

# Stage 1: Build the bundled web application
FROM node:20-slim AS builder
WORKDIR /app
# build-essential + python3 for any node-gyp native module compiles
# triggered by transitive deps (e.g. ultravisor pulls better-sqlite3).
RUN apt-get update && apt-get -y install build-essential python3 && rm -rf /var/lib/apt/lists/*
COPY package.json ./
# `--ignore-scripts` because retold-data-mapper depends on `ultravisor`,
# whose postinstall (`cd webinterface && npm install && npm run build`)
# needs `quack` (devDep) and routinely fails inside transitive installs.
# `npm rebuild` afterwards compiles native bindings the ignore-scripts
# would have skipped.
RUN npm install --ignore-scripts && npm rebuild
COPY .quackage.json ./
COPY source/ source/
COPY bin/ bin/
COPY model/ model/
RUN npx quack build

# Stage 2: Runtime
FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get -y install build-essential python3 && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm rebuild
COPY --from=builder /app/source/ source/
COPY --from=builder /app/bin/    bin/
COPY --from=builder /app/model/  model/

RUN mkdir -p /app/data
EXPOSE 8395
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD node -e "const h=require('http');h.get('http://localhost:8395/',(r)=>{process.exit(r.statusCode<500?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "bin/retold-data-mapper.js", "serve"]
