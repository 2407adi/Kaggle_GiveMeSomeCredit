# Stage 1: Build the app with Vite
FROM node:18 AS build
WORKDIR /app

# Vite inlines this at build time; ALWAYS pass the real backend URL when
# building for deployment: `--build-arg VITE_BACKEND_URL=https://<backend-fqdn>`
# (deploy.sh does this automatically). The localhost default is deliberate so
# an arg-less build fails loudly instead of silently pointing at a stale host.
ARG VITE_BACKEND_URL=http://localhost:8000
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Remove default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy built frontend files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy a custom nginx config (optional, good for SPAs)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 for Azure ingress
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]