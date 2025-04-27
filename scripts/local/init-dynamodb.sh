#!/bin/bash

# Wait for DynamoDB to be ready
echo "Waiting for DynamoDB to be ready..."
while ! aws dynamodb list-tables --endpoint-url http://localhost:8000 &>/dev/null; do
    sleep 1
done

echo "Creating tables..."

# Create stocks table
aws dynamodb create-table \
    --table-name stocks \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=symbol,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        "[{\"IndexName\": \"SymbolIndex\",\"KeySchema\": [{\"AttributeName\":\"symbol\",\"KeyType\":\"HASH\"}], \
        \"Projection\": {\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}}]" \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url http://localhost:8000

# Create portfolios table
aws dynamodb create-table \
    --table-name portfolios \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=user_id,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        "[{\"IndexName\": \"UserIdIndex\",\"KeySchema\": [{\"AttributeName\":\"user_id\",\"KeyType\":\"HASH\"}], \
        \"Projection\": {\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}}]" \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url http://localhost:8000

# Create transactions table
aws dynamodb create-table \
    --table-name transactions \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=portfolio_id,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        "[{\"IndexName\": \"PortfolioIdIndex\",\"KeySchema\": [{\"AttributeName\":\"portfolio_id\",\"KeyType\":\"HASH\"}], \
        \"Projection\": {\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}}]" \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --endpoint-url http://localhost:8000

echo "Tables created successfully!" 