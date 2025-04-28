# Technical Report - Fuse Stock Trading Service

## Architecture Overview

The Fuse Stock Trading Service is designed as a serverless microservice architecture using AWS Lambda functions. This architecture was chosen for its scalability, cost-efficiency, and ability to handle varying loads. The service integrates with an external vendor API to provide stock trading functionality.

### Core Components

1. **API Gateway**: Handles HTTP requests and routes them to the appropriate Lambda functions
2. **Lambda Functions**: Execute the business logic for each endpoint
3. **DynamoDB**: Stores stock tokens, cache, and transaction data
4. **CloudWatch**: Monitors and logs service performance and errors
5. **EventBridge**: Schedules and triggers the daily report generation

## Design Decisions

### 1. Clean Architecture Pattern

The service implements a clean architecture pattern with clearly separated layers:

- **Handlers**: Handle incoming requests and responses
- **Services**: Contain core business logic 
- **Repositories**: Handle data persistence and retrieval
- **Utilities**: Provide cross-cutting concerns like error handling

This separation of concerns makes the code more maintainable, testable, and allows for easier future changes to any layer.

### 2. Caching Strategy

A critical aspect of the implementation is the caching strategy for stock data. Due to the vendor API's unreliability and rate limits, I implemented a two-tier caching approach:

- **DynamoDB Cache**: Stores frequently accessed data with configurable TTL
- **Page-Specific Caching**: Uses a unique identifier for each pagination page to enable proper pagination through cached data

The cache is designed to handle both regular access patterns and edge cases:

- First-page queries use a base key structure for efficient retrieval
- Paginated queries use encoded token-based keys to ensure consistent pagination
- Pre-caching of next-page placeholders to preserve exact pagination tokens

This approach significantly reduces vendor API calls, improves response times, and provides resilience against vendor outages.

### 3. Error Handling and Resilience

The service includes comprehensive error handling to ensure reliability:

- **Lambda Error Middleware**: Wraps all handlers to provide consistent error responses
- **Circuit Breaking**: When the vendor API fails, the system falls back to cached data
- **Validation**: Input validation using Zod schemas to prevent invalid requests
- **Detailed Logging**: All operations and errors are logged for monitoring and debugging

### 4. Performance Optimizations

Several performance optimizations were implemented:

- **Efficient DynamoDB Access Patterns**: Using appropriate partition keys for optimal query performance
- **Pagination Support**: Efficient handling of large result sets through pagination
- **Minimized Cold Starts**: Lambda optimization to reduce cold start times
- **Cached Service Initialization**: Reuse of database connections across invocations

### 5. Testing Strategy

The service includes a comprehensive testing suite:

- **Unit Tests**: Testing isolated components
- **Integration Tests**: Testing repository interactions with the database
- **Service Tests**: Testing business logic with mocked dependencies
- **End-to-End Tests**: Testing complete request flows

## Implementation Challenges and Solutions

### Challenge 1: Vendor API Reliability

The vendor API is unreliable and changes stock prices every 5 minutes.

**Solution**: Implemented the caching system with appropriate TTL values matched to the vendor's update frequency. Cache invalidation is handled automatically through TTL to ensure fresh data while maintaining resilience.

### Challenge 2: Transaction Consistency

Stock purchase transactions need to be consistent, especially with price fluctuations.

**Solution**: Implemented validation that checks if the submitted price is within 2% of the current stock price before executing the transaction. This ensures fair pricing while accommodating small market fluctuations.

### Challenge 3: Pagination with Cached Data

Maintaining consistent pagination when mixing cached and fresh data presented challenges.

**Solution**: Developed a unique caching strategy that preserves the exact pagination tokens and encodes them in the cache keys. This ensures that regardless of whether data comes from cache or the live API, pagination remains consistent.

## Future Improvements

Given more time, I would consider the following enhancements:

1. **Redis Cache**: Adding a Redis cache layer for even faster access to frequently requested data
2. **Enhanced Monitoring**: Adding custom CloudWatch metrics for business KPIs
3. **API Gateway Caching**: Implementing API Gateway caching for publicly accessible endpoints
4. **Database Indexing**: Adding secondary indexes to support additional query patterns
5. **WebSocket Support**: Adding real-time updates for stock prices via WebSockets

## Deployment Strategy

The service is deployed using the Serverless Framework, which provides:

- Infrastructure as Code approach
- Environment-specific configurations
- Simple rollback capabilities
- Resource management

This enables continuous deployment with minimal downtime and risk.

## Conclusion

The Fuse Stock Trading Service is designed to be reliable, scalable, and maintainable. It addresses the core requirements while providing resilience against external dependencies. The architecture choices prioritize user experience while maintaining operational efficiency. 