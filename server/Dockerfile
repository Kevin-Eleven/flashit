# ---- Stage 1: Build ----
# Use Node 20 Alpine as the base — small image, fast pulls
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first — this layer is cached unless dependencies change
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies like tsx, @types/*)
# needed for the TypeScript compilation step
RUN npm ci

# Copy source code
COPY server.ts tsconfig.json ./

# Compile TypeScript → JavaScript into /app/dist/server.js
RUN npx tsc

# ---- Stage 2: Production ----
# Start fresh — only carry over the compiled JS + production deps
FROM node:20-alpine

WORKDIR /app

# Copy package files again into the clean image
COPY package.json package-lock.json ./

# Install ONLY production dependencies (express, socket.io)
# No TypeScript, no @types — keeps the image small (~60MB vs ~200MB)
RUN npm ci --omit=dev

# Copy the compiled JavaScript from the builder stage
COPY --from=builder /app/dist ./dist

# The port your server listens on (configurable via PORT env var)
EXPOSE 8000

# Run the compiled server
CMD ["node", "dist/server.js"]
