import express from 'express';
import * as k8s from '@kubernetes/client-node';
import { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { env } from './env.js';
import { createWorkerJob } from './jobs/worker.js';
import { initApp } from './express.js';
import { initClient } from './discord.js';

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.BatchV1Api);

// Register the join command
const commands = [
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join a voice channel')
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The voice channel to join')
                .setRequired(true)
        ).toJSON()
];

// Function to spawn a worker pod with guild and channel info
async function spawnWorkerPod(guildId: string, channelId: string): Promise<string> {
    const workerJob = await k8sApi.createNamespacedJob({
        namespace: env.K8S_NAMESPACE,
        body: createWorkerJob(guildId, channelId)
    });

    const jobName = workerJob.metadata?.name || 'unknown';
    console.log(`Worker job created: ${jobName} for guild: ${guildId}, channel: ${channelId}`);

    return jobName;
}

async function boot() {
    await initApp();
    console.log('Express app initialized');

    await initClient();
    console.log('Discord client initialized');
}

boot().catch(err => {
    console.error('Error during boot:', err);
    process.exit(1);
});