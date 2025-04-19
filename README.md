# Auxbot

A microservices-based application built with TypeScript and designed for Kubernetes (k3s) deployment. This project uses Turborepo for efficient monorepo management.

## Project Overview

Auxbot consists of two main components:

- **Controller**: A REST API service that manages and spawns worker instances
- **Worker**: A simple job processor that runs tasks and exits upon completion

## Architecture

This project follows a controller-worker architecture pattern:

- The **Controller** exposes an API endpoint that creates Kubernetes jobs
- Each **Worker** instance runs as a Kubernetes job, performs its task, and terminates

## Technology Stack

- **Language**: TypeScript
- **Build System**: Turborepo
- **Package Manager**: pnpm
- **Container Orchestration**: Kubernetes (k3s)
- **CI/CD**: GitHub Actions

## Repository Structure

```
auxbot/
├── apps/                  # Application code
│   ├── controller/        # Controller service
│   └── worker/            # Worker service
├── k8s/                   # Kubernetes manifests
│   ├── controller.yaml    # Deployment for controller
│   └── rbac.yaml          # RBAC configuration
└── packages/              # Shared configurations
    ├── eslint-config/     # ESLint configuration
    └── typescript-config/ # TypeScript configuration
```

## Development

### Prerequisites

- Node.js v20 or later
- pnpm
- Docker (for local image building)
- kubectl (for deployment)

### Local Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/auxbot.git
cd auxbot
pnpm install
```

To start both services in development mode:

```bash
pnpm dev
```

To develop a specific service:

```bash
# For controller
pnpm --filter "@auxbot/controller" dev

# For worker
pnpm --filter "@auxbot/worker" dev
```

## Building Docker Images

The project includes GitHub Actions workflows that automatically build and publish Docker images to GitHub Container Registry when changes are pushed to the master branch.

To build images locally:

```bash
# Build controller image
docker build -t auxbot-controller -f apps/controller/Dockerfile .

# Build worker image
docker build -t auxbot-worker -f apps/worker/Dockerfile .
```

## Deployment

### Prerequisites

- A Kubernetes cluster (k3s recommended)
- kubectl configured for your cluster

### Deploying to Kubernetes

1. Apply the RBAC configuration:

```bash
kubectl apply -f k8s/rbac.yaml
```

2. Deploy the controller:

```bash
kubectl apply -f k8s/controller.yaml
```

3. Test spawning a worker:

```bash
# Forward the controller service
kubectl port-forward svc/controller-service 8080:80

# In another terminal, spawn a worker
curl -X POST http://localhost:8080/spawn-worker
```

## CI/CD Pipeline

This project uses GitHub Actions for CI/CD:

- **controller-docker-build.yml**: Builds and publishes the controller image when controller code changes
- **worker-docker-build.yml**: Builds and publishes the worker image when worker code changes

## License

[MIT License](LICENSE)
