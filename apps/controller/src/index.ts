import express from 'express';
import * as k8s from '@kubernetes/client-node';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

app.get('/', (req, res) => {
    res.json({ message: 'Auxbot Controller API is running' });
});

// Endpoint to spawn a worker job
app.post('/spawn-worker', async (req, res) => {
    try {
        const namespace = process.env.K8S_NAMESPACE || 'default';
        const jobName = `auxbot-worker-${Date.now()}`;

        const jobBody: k8s.V1Pod = {
            kind: 'Job',
            metadata: {
                name: jobName,
                labels: {
                    app: 'auxbot-worker',
                },
            },
            spec: {
                containers: [{
                    name: 'worker',
                    image: process.env.WORKER_IMAGE || 'auxbot-worker:latest',
                    imagePullPolicy: 'IfNotPresent'
                }],
                restartPolicy: 'Never'
            }
        }

        const response = await k8sApi.createNamespacedPod({
            namespace: namespace,
            body: jobBody
        });

        console.log(`Worker job created: ${jobName}`);

        res.status(201).json({
            message: 'Worker job created',
            jobName: jobName
        });
    } catch (error: any) {
        console.error('Error creating worker job:', error);
        res.status(500).json({
            message: 'Failed to create worker job',
            error: error.message || 'Unknown error'
        });
    }
});

app.listen(port, () => {
    console.log(`Controller service listening on port ${port}`);
});