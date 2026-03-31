import type {
  PortkeyConfig,
  ManagerSyncCheckParams,
  ManagerSyncCheckResult,
  WaitTargetChainReadyParams,
  WaitTargetChainReadyResult,
} from '../../lib/types.js';
import { getHolderInfo } from './account.js';

const DEFAULT_MAX_READY_CHECKS = 20;
const DEFAULT_READY_DELAY_MS = 3000;

export async function checkManagerSyncState(
  config: PortkeyConfig,
  params: ManagerSyncCheckParams,
): Promise<ManagerSyncCheckResult> {
  if (!params.caHash) throw new Error('caHash is required');
  if (!params.chainId) throw new Error('chainId is required');
  if (!params.managerAddress) throw new Error('managerAddress is required');
  const requestedOriginChainId = params.originChainId;

  const targetHolderInfo = await getHolderInfoOrNull(config, {
    caHash: params.caHash,
    chainId: params.chainId,
  });
  if (targetHolderInfo) {
    const originHolderInfo = requestedOriginChainId && requestedOriginChainId !== params.chainId
      ? await getHolderInfoOrNull(config, {
        caHash: params.caHash,
        chainId: requestedOriginChainId,
      })
      : null;
    const isManagerSynced = targetHolderInfo.managerInfos.some(
      (item) => item.address === params.managerAddress,
    );

    return {
      state: isManagerSynced ? 'ready' : 'manager_unsynced',
      caHash: params.caHash,
      chainId: params.chainId,
      targetChainId: params.chainId,
      originChainId: requestedOriginChainId ?? null,
      managerAddress: params.managerAddress,
      caAddress: targetHolderInfo.caAddress,
      originCaAddress: requestedOriginChainId === params.chainId
        ? targetHolderInfo.caAddress
        : (originHolderInfo?.caAddress ?? null),
      isOriginHolderReady: requestedOriginChainId
        ? (requestedOriginChainId === params.chainId || Boolean(originHolderInfo))
        : false,
      isTargetHolderReady: true,
      isManagerSynced,
      managerInfos: targetHolderInfo.managerInfos,
      reason: isManagerSynced
        ? `Target-chain holder and manager are ready on ${params.chainId}.`
        : `Target-chain holder exists on ${params.chainId}, but manager ${params.managerAddress} has not synced yet.`,
    };
  }

  const shouldCheckOrigin = Boolean(requestedOriginChainId && requestedOriginChainId !== params.chainId);
  if (!shouldCheckOrigin) {
    return {
      state: 'origin_holder_missing',
      caHash: params.caHash,
      chainId: params.chainId,
      targetChainId: params.chainId,
      originChainId: requestedOriginChainId ?? null,
      managerAddress: params.managerAddress,
      caAddress: null,
      originCaAddress: null,
      isOriginHolderReady: false,
      isTargetHolderReady: false,
      isManagerSynced: false,
      managerInfos: [],
      reason: requestedOriginChainId && requestedOriginChainId === params.chainId
        ? `Holder is not available on ${params.chainId}; same-chain calls cannot treat this as cross-chain syncing.`
        : `Holder is not available on ${params.chainId}, and no originChainId was provided for cross-chain readiness checks.`,
    };
  }

  const originChainId = requestedOriginChainId as NonNullable<typeof requestedOriginChainId>;
  const originHolderInfo = await getHolderInfoOrNull(config, {
    caHash: params.caHash,
    chainId: originChainId,
  });

  if (originHolderInfo) {
    return {
      state: 'target_holder_syncing',
      caHash: params.caHash,
      chainId: params.chainId,
      targetChainId: params.chainId,
      originChainId,
      managerAddress: params.managerAddress,
      caAddress: null,
      originCaAddress: originHolderInfo.caAddress,
      isOriginHolderReady: true,
      isTargetHolderReady: false,
      isManagerSynced: false,
      managerInfos: [],
      reason: `Origin-chain holder already exists on ${originChainId}, but the target-chain holder is still syncing to ${params.chainId}.`,
    };
  }

  return {
    state: 'origin_holder_missing',
    caHash: params.caHash,
    chainId: params.chainId,
    targetChainId: params.chainId,
    originChainId,
    managerAddress: params.managerAddress,
    caAddress: null,
    originCaAddress: null,
    isOriginHolderReady: false,
    isTargetHolderReady: false,
    isManagerSynced: false,
    managerInfos: [],
    reason: `Holder is not available on target chain ${params.chainId}, and it was also not found on origin chain ${originChainId}.`,
  };
}

export async function waitTargetChainReady(
  config: PortkeyConfig,
  params: WaitTargetChainReadyParams,
): Promise<WaitTargetChainReadyResult> {
  if (!params.caHash) throw new Error('caHash is required');
  if (!params.managerAddress) throw new Error('managerAddress is required');
  if (!params.originChainId) throw new Error('originChainId is required');
  if (!params.targetChainId) throw new Error('targetChainId is required');

  const maxChecks = params.maxChecks ?? DEFAULT_MAX_READY_CHECKS;
  const delayMs = params.delayMs ?? DEFAULT_READY_DELAY_MS;
  if (!Number.isInteger(maxChecks) || maxChecks <= 0) {
    throw new Error('maxChecks must be a positive integer');
  }
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error('delayMs must be a non-negative integer');
  }
  let lastStatus: ManagerSyncCheckResult | null = null;

  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    const status = await checkManagerSyncState(config, {
      caHash: params.caHash,
      chainId: params.targetChainId,
      originChainId: params.originChainId,
      managerAddress: params.managerAddress,
    });
    lastStatus = status;

    if (status.state === 'ready') {
      return {
        ...status,
        ready: true,
        attempts: attempt,
        maxChecks,
        delayMs,
      };
    }

    if (status.state === 'origin_holder_missing') {
      return {
        ...status,
        ready: false,
        attempts: attempt,
        maxChecks,
        delayMs,
      };
    }

    if (attempt < maxChecks) {
      await sleep(delayMs);
    }
  }

  if (!lastStatus) {
    throw new Error('waitTargetChainReady did not produce a readiness result');
  }

  return {
    ...lastStatus,
    ready: false,
    attempts: maxChecks,
    maxChecks,
    delayMs,
  };
}

export function formatManagerSyncError(result: ManagerSyncCheckResult): string {
  const currentManagers = result.managerInfos.map((item) => item.address).filter(Boolean);
  const currentManagersSummary = currentManagers.length > 0
    ? `Current target-chain managers: ${currentManagers.slice(0, 3).join(', ')}${currentManagers.length > 3 ? ', ...' : ''}. `
    : 'No manager is currently visible on the target-chain holder yet. ';

  if (result.state === 'manager_unsynced') {
    return (
      `Target-chain holder is ready on ${result.targetChainId}, but manager ${result.managerAddress} is not synced yet. ` +
      currentManagersSummary +
      'First verify the selected loginEmail/keystoreFile or current signer. ' +
      'If this is the expected manager, wait for holder-info.managerInfos to include it before retrying.'
    );
  }

  if (result.state === 'target_holder_syncing') {
    return (
      `Origin-chain holder is already ready on ${result.originChainId}, but the target-chain holder is still syncing to ${result.targetChainId}. ` +
      'This is a normal cross-chain readiness gap. Wait for the target-chain holder to appear, or use wait-target-chain-ready before retrying.'
    );
  }

  if (result.state === 'origin_holder_missing') {
    const originSummary = result.originChainId && result.originChainId !== result.targetChainId
      ? ` It was also not found on origin chain ${result.originChainId}.`
      : '';
    return (
      `Holder is not ready on ${result.targetChainId}.${originSummary} ` +
      'This should not be treated as target-chain syncing. Verify the selected caHash / chain pair, or rerun register / recovery before retrying.'
    );
  }

  return result.reason;
}

async function getHolderInfoOrNull(
  config: PortkeyConfig,
  params: {
    caHash: string;
    chainId: ManagerSyncCheckParams['chainId'];
  },
) {
  try {
    return await getHolderInfo(config, params);
  } catch (error) {
    if (isHolderNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function isHolderNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Holder not found for caHash:');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
