import type { UiWalletHandle } from '@wallet-standard/ui';
import { getWalletFeature as getWalletFeatureBase } from '@wallet-standard/ui-features';
import { StandardConnect, StandardDisconnect, StandardEvents } from '@wallet-standard/features';
import type { 
  StandardConnectFeature, 
  StandardDisconnectFeature, 
  StandardEventsFeature 
} from '@wallet-standard/features';
import {
  SolanaSignMessage,
  SolanaSignTransaction,
  SolanaSignAndSendTransaction,
  SignAndSendAllTransactions,
  SolanaSignIn
} from '@solana/wallet-standard-features';
import type {
  SolanaFeatures
} from '@solana/wallet-standard-features';

/**
 * Type-safe wrapper for getWalletFeature with automatic type inference.
 * 
 * This function automatically infers the correct return type based on the feature name,
 * without requiring manual type mappings. It works by leveraging TypeScript's ability
 * to extract property types from union types.
 */

// Union of all standard features
type StandardFeatures = 
  | StandardConnectFeature
  | StandardDisconnectFeature
  | StandardEventsFeature;

// Union of all features (standard + solana)
type AllFeatures = StandardFeatures | SolanaFeatures;

// Helper type to extract the feature type based on its key
type ExtractFeature<TFeatureName extends string, TFeatures = AllFeatures> = 
  TFeatures extends { readonly [K in TFeatureName]: infer TFeature }
    ? TFeature
    : never;

// Type-safe getWalletFeature with automatic inference
export function getWalletFeature<
  TWalletHandle extends UiWalletHandle,
  TFeatureName extends TWalletHandle['features'][number]
>(
  uiWalletHandle: TWalletHandle,
  featureName: TFeatureName
): ExtractFeature<TFeatureName> {
  return getWalletFeatureBase(uiWalletHandle, featureName) as ExtractFeature<TFeatureName>;
}

// Re-export the feature constants for convenience
export { 
  StandardConnect, 
  StandardDisconnect, 
  StandardEvents,
  SolanaSignMessage,
  SolanaSignTransaction,
  SolanaSignAndSendTransaction,
  SignAndSendAllTransactions,
  SolanaSignIn
};

// Re-export the feature types
export type { 
  StandardConnectFeature, 
  StandardDisconnectFeature, 
  StandardEventsFeature,
  StandardConnectInput,
  StandardConnectOutput,
  StandardEventsListeners
} from '@wallet-standard/features';

export type {
  SolanaSignMessageFeature,
  SolanaSignTransactionFeature,
  SolanaSignAndSendTransactionFeature,
  SolanaSignAndSendAllTransactionsFeature,
  SolanaSignInFeature,
  SolanaSignMessageInput,
  SolanaSignMessageOutput,
  SolanaSignTransactionInput,
  SolanaSignTransactionOutput,
  SolanaSignAndSendTransactionInput,
  SolanaSignAndSendTransactionOutput,
  SolanaSignAndSendAllTransactionsOptions,
  SolanaSignInInput,
  SolanaSignInOutput
} from '@solana/wallet-standard-features';