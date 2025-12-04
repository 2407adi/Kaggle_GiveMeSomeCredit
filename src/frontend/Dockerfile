# Stage 1: Build the app with Vite
FROM node:18 AS build
WORKDIR /app

ENV VITE_BACKEND_URL=https://creditrisk-backend.thankfulhill-d4542afa.australiasoutheast.azurecontainerapps.io

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