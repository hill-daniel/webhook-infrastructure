import * as cdk from '@aws-cdk/core';
import * as gateway from '@aws-cdk/aws-apigateway';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sqs from '@aws-cdk/aws-sqs';
import * as path from 'path';
import * as secretsManager from '@aws-cdk/aws-secretsmanager';

export class WebhookBlogInfraStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const repositoryId = "YOUR_REPOSITORY_ID"

        const webhookRequestQueue = new sqs.Queue(this, 'github-request-queue', {
            queueName: 'github-request-queue',
            encryption: sqs.QueueEncryption.KMS_MANAGED,
        });

        const webhookLambda = new lambda.Function(this, 'github-webhook', {
            functionName: 'github-webhook',
            runtime: lambda.Runtime.GO_1_X,
            handler: 'webhook',
            environment: {
                MESSAGE_QUEUE_URL: webhookRequestQueue.queueUrl,
            },
            timeout: cdk.Duration.seconds(10),
            code: lambda.Code.fromAsset(path.join(__dirname, '../../drizzle-webhook'), {
                bundling: {
                    image: cdk.DockerImage.fromRegistry('golang:1.17-alpine'),
                    user: 'root',
                    environment: {
                        CGO_ENABLED: '0',
                        GOOS: 'linux',
                        GOARCH: 'amd64',
                    },
                    command: [
                        '/bin/sh', '-c', [
                            'go mod download',
                            'go mod verify',
                            'go build cmd/webhook/webhook.go',
                            'cp webhook /asset-output/',
                        ].join(' && ')
                    ]
                },
            }),
        });
        webhookRequestQueue.grantSendMessages(webhookLambda)

        const webhookSecret = new secretsManager.Secret(this, 'webhook-secret', {
            secretName: 'GITHUB_WEBHOOK_' + repositoryId
        });
        webhookSecret.grantRead(webhookLambda);

        const api = new gateway.LambdaRestApi(this, 'github-webhook-api', {
            restApiName: 'GitHub webhook handler',
            description: 'accepts incoming webhook POST requests and validates them',
            handler: webhookLambda
        });

        new cdk.CfnOutput(this, 'webhookAPIURL', {value: api.url});
    }
}
