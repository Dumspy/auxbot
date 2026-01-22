# Auxbot Specifications

Design documentation for Auxbot, a microservices-based Discord bot built with TypeScript and Kubernetes.

## Discord Bot Commands

| Spec                                       | Code                                      | Purpose                                         |
| ------------------------------------------ | ----------------------------------------- | ----------------------------------------------- |
| [summary-feature.md](./summary-feature.md) | `apps/controller/src/commands/summary.ts` | AI-powered message summarization using Zhipu AI |

## Architecture

| Spec | Code               | Purpose                                    |
| ---- | ------------------ | ------------------------------------------ |
| TBD  | `apps/controller/` | Controller service architecture and design |
| TBD  | `apps/worker/`     | Worker service architecture and design     |

## API Documentation

| Spec | Code               | Purpose                 |
| ---- | ------------------ | ----------------------- |
| TBD  | `packages/protos/` | gRPC API specifications |

## Configuration

| Spec | Code                         | Purpose                            |
| ---- | ---------------------------- | ---------------------------------- |
| TBD  | `apps/controller/src/env.ts` | Environment variable configuration |
| TBD  | `apps/worker/src/env.ts`     | Environment variable configuration |

## Deployment

| Spec | Code                 | Purpose                       |
| ---- | -------------------- | ----------------------------- |
| TBD  | `.github/workflows/` | CI/CD pipeline specifications |

---

**Note:** This is an index of all design specifications. For detailed implementation plans, see individual spec documents.
