import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import type { UiWallet } from '@wallet-standard/ui';
import { StandardConnect, StandardDisconnect, StandardEvents } from '@wallet-standard/features';
import { 
  WalletsStore, 
  UiWalletsStore, 
  WalletConnection,
  UiWalletConnect
} from './wallets.svelte.js';
import type { StandardConnectFeature, StandardDisconnectFeature } from '@wallet-standard/features';

// Helper function to get typed features from raw Wallet objects (for testing)
function getConnectFeature(wallet: Wallet): StandardConnectFeature[typeof StandardConnect] {
  return wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
}

function getDisconnectFeature(wallet: Wallet): StandardDisconnectFeature[typeof StandardDisconnect] {
  return wallet.features[StandardDisconnect] as StandardDisconnectFeature[typeof StandardDisconnect];
}

// Mock the wallet-standard modules
vi.mock('@wallet-standard/app');

vi.mock('@wallet-standard/ui-registry', () => ({
  getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: vi.fn(),
  getOrCreateUiWalletAccountForStandardWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: vi.fn(),
  getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: vi.fn()
}));

vi.mock('@wallet-standard/ui-features', () => ({
  getWalletFeature: vi.fn()
}));

describe('WalletsStore', () => {
  let mockGet: ReturnType<typeof vi.fn<() => readonly Wallet[]>>;
  let mockOn: ReturnType<typeof vi.fn<(event: string, callback: () => void) => () => void>>;
  let registerCallback: () => void;
  let unregisterCallback: () => void;
  let store: WalletsStore;

  beforeEach(() => {
    mockGet = vi.fn(() => []);
    mockOn = vi.fn((event: string, callback: () => void) => {
      if (event === 'register') registerCallback = callback;
      if (event === 'unregister') unregisterCallback = callback;
      return () => {}; // disposer
    });
    
    vi.mocked(getWallets).mockReturnValue({ 
      get: mockGet, 
      on: mockOn,
      register: vi.fn()
    });
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
    vi.clearAllMocks();
  });

  it('should initialize with wallets from registry', () => {
    const mockWallets = [
      { name: 'Wallet 1', features: {} } as Wallet,
      { name: 'Wallet 2', features: {} } as Wallet
    ];
    mockGet.mockReturnValue(mockWallets);

    store = new WalletsStore();
    
    expect(store.wallets).toEqual(mockWallets);
    expect(mockGet).toHaveBeenCalled();
  });

  it('should update wallets when registry fires register event', () => {
    const initialWallet = { name: 'Wallet 1', features: {} } as Wallet;
    const newWallet = { name: 'Wallet 2', features: {} } as Wallet;
    
    mockGet.mockReturnValue([initialWallet]);
    store = new WalletsStore();
    
    expect(store.wallets).toEqual([initialWallet]);

    // Simulate wallet registration - mock returns new array and callback is called
    mockGet.mockReturnValue([initialWallet, newWallet]);
    registerCallback();
    
    expect(store.wallets).toEqual([initialWallet, newWallet]);
  });

  it('should update wallets when registry fires unregister event', () => {
    const wallet1 = { name: 'Wallet 1', features: {} } as Wallet;
    const wallet2 = { name: 'Wallet 2', features: {} } as Wallet;
    
    mockGet.mockReturnValue([wallet1, wallet2]);
    store = new WalletsStore();
    
    expect(store.wallets).toHaveLength(2);

    // Simulate wallet unregistration - mock returns new array and callback is called
    mockGet.mockReturnValue([wallet1]);
    unregisterCallback();
    
    expect(store.wallets).toEqual([wallet1]);
  });

  it('should listen to wallet change events when wallet supports StandardEvents', () => {
    let changeCallback: any;
    const mockEventsFeature = {
      version: '1.0.0',
      on: vi.fn((event: string, callback: any) => {
        if (event === 'change') changeCallback = callback;
        return () => {}; // disposer
      })
    };

    const wallet = {
      name: 'Test Wallet',
      features: {
        [StandardEvents]: mockEventsFeature
      }
    } as unknown as Wallet;

    mockGet.mockReturnValue([wallet]);
    store = new WalletsStore();

    expect(mockEventsFeature.on).toHaveBeenCalledWith('change', expect.any(Function));

    // Trigger change event
    const initialLength = store.wallets.length;
    flushSync(() => {
      changeCallback();
    });
    
    // Wallets array should be updated (new reference)
    expect(store.wallets).toHaveLength(initialLength);
  });

  it('should cleanup event listeners on destroy', () => {
    const disposer = vi.fn();
    mockOn.mockReturnValue(disposer);

    store = new WalletsStore();
    store.destroy();

    expect(disposer).toHaveBeenCalledTimes(2); // register and unregister listeners
  });
});

describe('UiWalletsStore', () => {
  let mockGet: ReturnType<typeof vi.fn<() => readonly Wallet[]>>;
  let mockOn: ReturnType<typeof vi.fn<(event: string, callback: () => void) => () => void>>;
  let store: UiWalletsStore;

  beforeEach(async () => {
    mockGet = vi.fn(() => []);
    mockOn = vi.fn(() => () => {});
    vi.mocked(getWallets).mockReturnValue({ 
      get: mockGet, 
      on: mockOn,
      register: vi.fn()
    });

    // Configure UI wallet mock
    const mockRegistry = await import('@wallet-standard/ui-registry');
    vi.mocked(mockRegistry.getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED).mockImplementation((wallet: Wallet) => {
      const featureNames = Object.keys(wallet.features).filter(key => key.includes(':'));
      
      // Create a proper UiWallet mock that matches the expected interface
      const uiWallet: UiWallet = {
        name: wallet.name,
        version: wallet.version,
        icon: wallet.icon,
        chains: wallet.chains,
        __type: 'UiWalletHandle',
        ['~uiWalletHandle']: Symbol('UiWalletHandle'),
        features: featureNames,
        accounts: []
      } as UiWallet;
      
      return uiWallet;
    });
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
    vi.clearAllMocks();
  });

  it('should convert standard wallets to UI wallets', () => {
    const mockWallets = [
      { name: 'Wallet 1', features: {} } as Wallet,
      { name: 'Wallet 2', features: {} } as Wallet
    ];
    mockGet.mockReturnValue(mockWallets);

    store = new UiWalletsStore();
    
    expect(store.wallets).toHaveLength(2);
    expect(store.wallets[0]).toHaveProperty('__type', 'UiWalletHandle');
    expect(store.wallets[1]).toHaveProperty('__type', 'UiWalletHandle');
  });
});

describe('WalletConnection', () => {
  let connection: WalletConnection;
  let mockWallet: Wallet;

  beforeEach(() => {
    connection = new WalletConnection();
    mockWallet = {
      name: 'Test Wallet',
      features: {
        [StandardConnect]: {
          version: '1.0.0',
          connect: vi.fn(() => Promise.resolve({ accounts: [{ address: '0x123' }] }))
        },
        [StandardDisconnect]: {
          version: '1.0.0',
          disconnect: vi.fn(() => Promise.resolve())
        }
      }
    } as unknown as Wallet;
  });

  it('should start with disconnected state', () => {
    expect(connection.wallet).toBeNull();
    expect(connection.account).toBeNull();
    expect(connection.connected).toBe(false);
    expect(connection.connecting).toBe(false);
    expect(connection.error).toBeNull();
  });

  it('should connect to wallet', async () => {
    await connection.connect(mockWallet);

    expect(connection.wallet).toStrictEqual(mockWallet);
    expect(connection.account).toEqual({ address: '0x123' });
    expect(connection.connected).toBe(true);
    expect(connection.connecting).toBe(false);
    expect(connection.error).toBeNull();
  });

  it('should prevent duplicate connections', async () => {
    const connectPromise1 = connection.connect(mockWallet);
    const connectPromise2 = connection.connect(mockWallet);

    await Promise.all([connectPromise1, connectPromise2]);

    // Connect should only be called once
    const connectFeature = getConnectFeature(mockWallet);
    expect(connectFeature.connect).toHaveBeenCalledTimes(1);
  });

  it('should handle connection errors', async () => {
    const error = new Error('Connection failed');
    const mockConnect = vi.fn(() => Promise.reject(error));
    const originalFeature = mockWallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
    const newFeatures: Record<string, any> = {};
    for (const [key, value] of Object.entries(mockWallet.features)) {
      newFeatures[key] = value;
    }
    newFeatures[StandardConnect] = {
      version: originalFeature.version,
      connect: mockConnect
    };
    mockWallet = {
      ...mockWallet,
      features: newFeatures
    } as unknown as Wallet;

    await connection.connect(mockWallet);

    expect(connection.error).toBe(error);
    expect(connection.connected).toBe(false);
    expect(connection.wallet).toBeNull();
  });

  it('should disconnect from wallet', async () => {
    await connection.connect(mockWallet);
    await connection.disconnect();

    const disconnectFeature = getDisconnectFeature(mockWallet);
    expect(disconnectFeature.disconnect).toHaveBeenCalled();
    expect(connection.wallet).toBeNull();
    expect(connection.account).toBeNull();
    expect(connection.connected).toBe(false);
  });

  it('should handle disconnect errors', async () => {
    const error = new Error('Disconnect failed');
    const mockDisconnect = vi.fn(() => Promise.reject(error));
    const originalFeature = mockWallet.features[StandardDisconnect] as StandardDisconnectFeature[typeof StandardDisconnect];
    const newFeatures: Record<string, any> = {};
    for (const [key, value] of Object.entries(mockWallet.features)) {
      newFeatures[key] = value;
    }
    newFeatures[StandardDisconnect] = {
      version: originalFeature.version,
      disconnect: mockDisconnect
    };
    mockWallet = {
      ...mockWallet,
      features: newFeatures
    } as unknown as Wallet;

    await connection.connect(mockWallet);
    await connection.disconnect();

    expect(connection.error).toBe(error);
  });

  it('should handle wallet without connect feature', async () => {
    const walletWithoutConnect = {
      name: 'Basic Wallet',
      features: {}
    } as unknown as Wallet;

    await connection.connect(walletWithoutConnect);
    
    // Should not connect when wallet lacks StandardConnect feature
    expect(connection.connected).toBe(false);
    expect(connection.wallet).toBeNull();
    expect(connection.account).toBeNull();
    expect(connection.connecting).toBe(false);
  });

  it('should handle wallet without disconnect feature', async () => {
    const walletWithoutDisconnect = {
      name: 'Connect Only Wallet',
      features: {
        [StandardConnect]: {
          version: '1.0.0',
          connect: vi.fn(() => Promise.resolve({ accounts: [{ address: '0x123' }] }))
        }
      }
    } as unknown as Wallet;

    await connection.connect(walletWithoutDisconnect);
    expect(connection.connected).toBe(true);

    await connection.disconnect();
    
    // Should clear connection state even without disconnect feature
    expect(connection.connected).toBe(false);
    expect(connection.wallet).toBeNull();
    expect(connection.account).toBeNull();
    expect(connection.error).toBeNull();
  });
});

describe('UiWalletConnect', () => {
  let mockWallet: UiWallet;
  let connectHelper: UiWalletConnect;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    
    const fullMockWallet = {
      name: 'Test Wallet',
      version: '1.0.0' as const,
      icon: 'data:image/svg+xml;base64,' as const,
      chains: [],
      accounts: [],
      features: {
        [StandardConnect]: {
          version: '1.0.0' as const,
          connect: vi.fn(() => Promise.resolve({ accounts: [{ address: '0x123' }] }))
        }
      }
    } as Wallet;

    mockWallet = {
      name: 'Test Wallet',
      features: [StandardConnect],
      __type: 'UiWalletHandle',
      ['~uiWalletHandle']: Symbol.for('UiWalletHandle'),
      chains: [],
      icon: 'data:image/svg+xml;base64,' as const,
      version: '1.0.0' as const,
      accounts: []
    } as UiWallet;

    const mockGet = vi.fn(() => [fullMockWallet]);
    
    vi.mocked(getWallets).mockReturnValue({ 
      get: mockGet, 
      on: vi.fn(),
      register: vi.fn()
    });

    // Configure the mocks for this test
    const mockRegistry = await import('@wallet-standard/ui-registry');
    const mockUiFeatures = await import('@wallet-standard/ui-features');
    
    vi.mocked(mockRegistry.getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED).mockReturnValue(mockWallet);
    vi.mocked(mockRegistry.getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED).mockReturnValue(fullMockWallet);
    vi.mocked(mockUiFeatures.getWalletFeature).mockReturnValue({
      version: '1.0.0',
      connect: vi.fn(() => Promise.resolve({ accounts: [{ address: '0x123' }] }))
    });

    connectHelper = new UiWalletConnect(mockWallet);
  });

  it('should track connection state', async () => {
    expect(connectHelper.connecting).toBe(false);
    expect(connectHelper.error).toBeNull();

    const promise = connectHelper.connect();
    expect(connectHelper.connecting).toBe(true);

    await promise;
    expect(connectHelper.connecting).toBe(false);
  });

  it('should deduplicate concurrent connections', async () => {
    const promise1 = connectHelper.connect();
    const promise2 = connectHelper.connect();

    const results = await Promise.all([promise1, promise2]);
    
    // Both promises should resolve to the same result
    expect(results[0]).toBe(results[1]);
  });

  it('should handle wallet not found error', async () => {
    const mockGet = vi.fn(() => []); // No wallets
    vi.mocked(getWallets).mockReturnValue({ 
      get: mockGet, 
      on: vi.fn(),
      register: vi.fn()
    });

    await expect(connectHelper.connect()).rejects.toThrow('not found in global registry');
    expect(connectHelper.error).toBeTruthy();
    expect(connectHelper.connecting).toBe(false);
  });
});

describe('Reactive state updates', () => {
  it('should trigger reactive updates when wallet properties change', () => {
    const cleanup = $effect.root(() => {
      const mockGet = vi.fn(() => []);
      const mockOn = vi.fn(() => () => {});
      vi.mocked(getWallets).mockReturnValue({ 
        get: mockGet, 
        on: mockOn,
        register: vi.fn()
      });

      const store = new WalletsStore();
      let updateCount = 0;
      
      // Track reactive updates
      $effect(() => {
        // Access the reactive state to trigger effect
        store.wallets.length;
        updateCount++;
      });

      // effects normally run after a microtask, use flushSync to execute all pending effects synchronously
      flushSync();
      expect(updateCount).toBe(1);

      // Trigger reactive update by adding a wallet
      store.wallets = [...store.wallets, { name: 'New Wallet' } as Wallet];
      flushSync();

      expect(updateCount).toBe(2);
      expect(store.wallets[store.wallets.length - 1].name).toBe('New Wallet');

      store.destroy();
    });

    cleanup();
  });

  it('should maintain reactive connection state', () => {
    const cleanup = $effect.root(() => {
      const connection = new WalletConnection();
      let connectedUpdates = 0;
      
      // Track reactive updates
      $effect(() => {
        // Access the reactive state to trigger effect
        connection.connected;
        connectedUpdates++;
      });

      // effects normally run after a microtask, use flushSync to execute all pending effects synchronously
      flushSync();
      expect(connectedUpdates).toBe(1);
      expect(connection.connected).toBe(false);

      // Test the reactivity by manually triggering state changes
      connection.connected = true;
      flushSync();
      
      expect(connectedUpdates).toBe(2);
      expect(connection.connected).toBe(true);
    });

    cleanup();
  });
});