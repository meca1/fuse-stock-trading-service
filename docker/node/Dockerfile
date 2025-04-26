FROM node:18.9.0

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Set environment variables
ENV NODE_ENV=development

# Command to run when container starts
CMD ["npm", "run", "db:init:force"]
