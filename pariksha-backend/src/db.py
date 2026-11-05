"""DynamoDB table accessors and S3 client."""

import boto3

from src.config import settings

_dynamodb = boto3.resource("dynamodb", region_name=settings.aws_region)

users_table = _dynamodb.Table(settings.users_table)
attempts_table = _dynamodb.Table(settings.attempts_table)
library_table = _dynamodb.Table(settings.library_table)

s3 = boto3.client("s3", region_name=settings.aws_region)
