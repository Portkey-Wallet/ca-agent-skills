import type {
  PortkeyConfig,
  ManagerSyncCheckParams,
  ManagerSyncCheckResult,
} from '../../lib/types.js';
import { getHolderInfo } from './account.js';

export async function checkManagerSyncState(
  config: PortkeyConfig,
  params: ManagerSyncCheckParams,
): Promise<ManagerSyncCheckResult> {
  if (!params.caHash) throw new Error('caHash is required');
  if (!params.chainId) throw new Error('chainId is required');
  if (!params.managerAddress) throw new Error('managerAddress is required');

  const holderInfo = await getHolderInfo(config, {
    caHash: params.caHash,
    chainId: params.chainId,
  });
  const isManagerSynced = holderInfo.managerInfos.some((item) => item.address === params.managerAddress);

  return {
    caHash: params.caHash,
    chainId: params.chainId,
    managerAddress: params.managerAddress,
    caAddress: holderInfo.caAddress,
    isManagerSynced,
    managerInfos: holderInfo.managerInfos,
  };
}

export function formatManagerSyncError(result: ManagerSyncCheckResult): string {
  return (
    `Manager ${result.managerAddress} is not yet synced on ${result.chainId}. ` +
    'Wait for holder-info.managerInfos to include this manager before retrying.'
  );
}
