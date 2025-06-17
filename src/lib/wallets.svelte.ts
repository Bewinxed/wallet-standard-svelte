import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import { StandardConnect, StandardDisconnect, StandardEvents } from '@wallet-standard/features';
import type { StandardConnectFeature, StandardDisconnectFeature, StandardEventsFeature } from '@wallet-standard/features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { getWalletFeature } from './getWalletFeature.js';
import {
	getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	getOrCreateUiWalletAccountForStandardWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
} from '@wallet-standard/ui-registry';
import { getContext, setContext } from 'svelte';

// Re-export UI types for compatibility with React version
export * from '@wallet-standard/ui';

// Export our typed getWalletFeature
export { getWalletFeature } from './getWalletFeature.js';

// Track connection promises to prevent duplicate connections
const connectionPromises = new WeakMap<Wallet, Promise<any>>();

// Context key for wallet store
const WALLET_STORE_KEY = Symbol('wallet-store');

// Reactive wallets store class
export class WalletsStore {
	wallets = $state<readonly Wallet[]>([]);
	private disposers: (() => void)[] = [];
	private eventDisposers: (() => void)[] = [];

	constructor() {
		const { get, on } = getWallets();
		
		// Initial wallets
		this.wallets = get();
		
		// Listen for wallet registry changes
		this.disposers.push(
			on('register', () => {
				this.wallets = get();
				this.setupEventListeners();
			}),
			on('unregister', () => {
				this.wallets = get();
				this.setupEventListeners();
			})
		);
		
		// Setup initial event listeners
		this.setupEventListeners();
	}

	private setupEventListeners() {
		// Clear existing event listeners first
		this.eventDisposers.forEach(dispose => dispose());
		this.eventDisposers = [];
		
		// Listen to wallet property changes if they support StandardEvents
		this.wallets.forEach(wallet => {
			if (StandardEvents in wallet.features) {
				const eventsFeature = wallet.features[StandardEvents] as StandardEventsFeature[typeof StandardEvents];
				const dispose = eventsFeature.on('change', () => {
					// Force reactive update by reassigning
					this.wallets = [...this.wallets];
				});
				this.eventDisposers.push(dispose);
			}
		});
	}

	destroy() {
		this.disposers.forEach(dispose => dispose());
		this.eventDisposers.forEach(dispose => dispose());
		this.disposers = [];
		this.eventDisposers = [];
	}
}

// UiWallets store - simplified since registry handles caching
export class UiWalletsStore {
	wallets = $state<readonly UiWallet[]>([]);
	private disposers: (() => void)[] = [];
	
	constructor() {
		this.loadWallets();
		this.setupWalletListeners();
	}
	
	private loadWallets() {
		// Get wallets directly from the global registry - it handles caching and identity
		const { get } = getWallets();
		const rawWallets = get();
		
		// Registry ensures consistent object identity, so no need for manual caching
		this.wallets = rawWallets.map(getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED);
	}
	
	private setupWalletListeners() {
		const { on } = getWallets();
		
		this.disposers.push(
			on('register', () => {
				this.loadWallets();
			}),
			on('unregister', () => {
				this.loadWallets();
			})
		);
	}
	
	destroy() {
		this.disposers.forEach(dispose => dispose());
		this.disposers = [];
	}
}

// Wallet connection class
export class WalletConnection {
	wallet = $state<Wallet | null>(null);
	account = $state<any>(null);
	connecting = $state(false);
	connected = $state(false);
	error = $state<Error | null>(null);

	async connect(wallet: Wallet): Promise<void> {
		if (this.connecting) return;
		
		this.connecting = true;
		this.error = null;

		try {
			// Check if wallet has connection promise to prevent duplicates
			const existingPromise = connectionPromises.get(wallet);
			if (existingPromise) {
				const result = await existingPromise;
				this.wallet = wallet;
				this.account = result.accounts?.[0] || null;
				this.connected = true;
				return;
			}

			// Use proper StandardConnect feature
			if (StandardConnect in wallet.features) {
				const connectFeature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
				const connectionPromise = connectFeature.connect().then((result) => {
					// Connection successful
					this.wallet = wallet;
					this.account = result.accounts[0] || null;
					this.connected = true;
					return result;
				}).finally(() => {
					connectionPromises.delete(wallet);
				});
				
				connectionPromises.set(wallet, connectionPromise);
				await connectionPromise;
			}
		} catch (error) {
			this.error = error as Error;
		} finally {
			this.connecting = false;
		}
	}

	async disconnect(): Promise<void> {
		if (!this.wallet) return;

		try {
			// Use proper StandardDisconnect feature
			if (StandardDisconnect in this.wallet.features) {
				const disconnectFeature = this.wallet.features[StandardDisconnect] as StandardDisconnectFeature[typeof StandardDisconnect];
				await disconnectFeature.disconnect();
			}

			// Clear connection state
			this.wallet = null;
			this.account = null;
			this.connected = false;
			this.error = null;
		} catch (error) {
			this.error = error as Error;
		}
	}
}

// Connect functionality for a specific UiWallet
export class UiWalletConnect {
	connecting = $state(false);
	error = $state<Error | null>(null);
	private connectionPromise: Promise<readonly UiWalletAccount[]> | null = null;
	private uiWallet: UiWallet;

	constructor(uiWallet: UiWallet) {
		this.uiWallet = uiWallet;
	}

	async connect(input?: any): Promise<readonly UiWalletAccount[]> {
		if (this.connectionPromise) {
			return this.connectionPromise;
		}

		this.connecting = true;
		this.error = null;

		// WORKAROUND: Get a fresh UiWallet from the registry to avoid Svelte proxy issues
		const { get } = getWallets();
		const globalWallets = get();
		const matchingWallet = globalWallets.find(w => w.name === this.uiWallet.name);
		
		if (!matchingWallet) {
			this.connecting = false;
			const error = new Error(`Wallet "${this.uiWallet.name}" not found in global registry`);
			this.error = error;
			throw error;
		}
		
		// Create a fresh UiWallet that will have proper handles
		const freshUiWallet = getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(matchingWallet);
		
		const wallet = getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(freshUiWallet);
		const connectFeature = getWalletFeature(freshUiWallet, StandardConnect);

		this.connectionPromise = connectFeature.connect(input)
			.then(({ accounts }) => {
				return accounts.map(
					getOrCreateUiWalletAccountForStandardWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.bind(
						null,
						wallet
					)
				) as readonly UiWalletAccount[];
			})
			.catch(error => {
				this.error = error as Error;
				throw error;
			})
			.finally(() => {
				this.connecting = false;
				this.connectionPromise = null;
			});
		
		return this.connectionPromise;
	}
}

// Disconnect functionality for a specific UiWallet
export class UiWalletDisconnect {
	disconnecting = $state(false);
	error = $state<Error | null>(null);
	private disconnectionPromise: Promise<void> | null = null;
	private uiWallet: UiWallet;

	constructor(uiWallet: UiWallet) {
		this.uiWallet = uiWallet;
	}

	async disconnect(): Promise<void> {
		if (this.disconnectionPromise) {
			return this.disconnectionPromise;
		}

		this.disconnecting = true;
		this.error = null;

		// WORKAROUND: Get a fresh UiWallet from the registry to avoid Svelte proxy issues
		const { get } = getWallets();
		const globalWallets = get();
		const matchingWallet = globalWallets.find(w => w.name === this.uiWallet.name);
		
		if (!matchingWallet) {
			throw new Error(`Wallet "${this.uiWallet.name}" not found in global registry`);
		}
		
		// Create a fresh UiWallet that will have proper handles
		const freshUiWallet = getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(matchingWallet);
		
		const disconnectFeature = getWalletFeature(freshUiWallet, StandardDisconnect);

		this.disconnectionPromise = disconnectFeature.disconnect()
			.catch(error => {
				this.error = error as Error;
				throw error;
			})
			.finally(() => {
				this.disconnecting = false;
				this.disconnectionPromise = null;
			});
		
		return this.disconnectionPromise;
	}
}

// Legacy classes for raw wallets (backward compatibility)
export class WalletConnect {
	connecting = $state(false);
	error = $state<Error | null>(null);
	private connectionPromise: Promise<any> | null = null;
	private wallet: Wallet;

	constructor(wallet: Wallet) {
		this.wallet = wallet;
	}

	async connect(
		input?: Parameters<StandardConnectFeature[typeof StandardConnect]['connect']>[0]
	): Promise<any> {
		if (this.connectionPromise) {
			return this.connectionPromise;
		}

		this.connecting = true;
		this.error = null;

		if (StandardConnect in this.wallet.features) {
			const connectFeature = this.wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
			this.connectionPromise = connectFeature.connect(input)
				.then(result => {
					return result.accounts;
				})
				.catch(error => {
					this.error = error as Error;
					throw error;
				})
				.finally(() => {
					this.connecting = false;
					this.connectionPromise = null;
				});
			
			return this.connectionPromise;
		}

		this.connecting = false;
		return [];
	}
}

export class WalletDisconnect {
	disconnecting = $state(false);
	error = $state<Error | null>(null);
	private disconnectionPromise: Promise<void> | null = null;
	private wallet: Wallet;

	constructor(wallet: Wallet) {
		this.wallet = wallet;
	}

	async disconnect(): Promise<void> {
		if (this.disconnectionPromise) {
			return this.disconnectionPromise;
		}

		this.disconnecting = true;
		this.error = null;

		if (StandardDisconnect in this.wallet.features) {
			const disconnectFeature = this.wallet.features[StandardDisconnect] as StandardDisconnectFeature[typeof StandardDisconnect];
			this.disconnectionPromise = disconnectFeature.disconnect()
				.catch(error => {
					this.error = error as Error;
					throw error;
				})
				.finally(() => {
					this.disconnecting = false;
					this.disconnectionPromise = null;
				});
			
			return this.disconnectionPromise;
		}

		this.disconnecting = false;
	}
}

/**
 * Sets up the wallet store context. Call this in your root component or layout.
 */
export function setWalletContext() {
	const store = new UiWalletsStore();
	setContext(WALLET_STORE_KEY, store);
	return store;
}

/**
 * Returns an array of UiWallet objects; one for every registered Wallet Standard Wallet.
 * This provides the same functionality as React's useWallets() but uses Svelte context.
 */
export function useWallets(): readonly UiWallet[] {
	// Get wallets directly from the global registry - no intermediary stores
	const { get } = getWallets();
	const rawWallets = get();
	
	// Convert to UiWallets using the official registry function
	return rawWallets.map(getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED);
}

/**
 * Gets the wallet store from context. Useful for accessing the store instance directly.
 */
export function getWalletStore(): UiWalletsStore {
	const store = getContext<UiWalletsStore>(WALLET_STORE_KEY);
	
	if (!store) {
		throw new Error('getWalletStore must be called within a component that has wallet context set. Call setWalletContext() in your root component.');
	}
	
	return store;
}

