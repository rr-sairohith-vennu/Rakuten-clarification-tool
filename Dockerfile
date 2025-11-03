# Use Node.js with Playwright pre-installed browsers
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (with verbose logging for debugging)
RUN npm ci --verbose

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p screenshots results uploads

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start the application
CMD ["npm", "start"]
