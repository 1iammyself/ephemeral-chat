# Stage 1: Build the frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build the backend (Go)
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy built frontend assets to the expected location for embedding
COPY --from=frontend-builder /app/web/dist ./web/dist
RUN go build -o e2ecp main.go

# Stage 3: Runtime image
FROM alpine:latest
WORKDIR /app
RUN apk --no-cache add ca-certificates
COPY --from=backend-builder /app/e2ecp /app/e2ecp
EXPOSE 8080
CMD ["/app/e2ecp", "serve", "--max-rooms", "100"]
