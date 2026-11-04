"""DynamoDB table accessors."""

import boto3

from src.config import settings

_dynamodb = boto3.resource("dynamodb", region_name=settings.aws_region)

users_table = _dynamodb.Table(settings.users_table)
attempts_table = _dynamodb.Table(settings.attempts_table)
