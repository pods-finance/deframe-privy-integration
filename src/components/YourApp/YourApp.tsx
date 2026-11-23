import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import Auth from '../Auth';
import EarnWidgetHost from '../EarnWidgetHost';
import Ramp, { RampKyc } from '../Ramp';
import PixRampTab from '../Ramp/PixRampTab';
import Strategies from '../Strategies';
import PreviewBridgeSwap from '../Swap/PreviewBridgeSwap';
import Swap from '../Swap';
import Transfer from '../Transfer/Transfer';
import Wallets from '../Wallets';
import { WalletProvider } from '../Wallets/WalletContext';
import { useWalletContext } from '../Wallets/useWalletContext';

type Tab = 'app' | 'transfer' | 'swap' | 'kyc' | 'ramp' | 'pix-onramp' | 'pix-offramp' | 'bridge-swap' | 'deframe';

function TabPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui-panel-shell flex flex-col gap-5 p-6 lg:p-8">
      {children}
    </div>
  );
}

function SwapTabPanel() {
  const { activeWalletAddress } = useWalletContext();
  return (
    <TabPanel>
      <Wallets />
      <Swap walletAddress={activeWalletAddress} />
    </TabPanel>
  );
}

function TransferTabPanel() {
  const { activeWalletAddress } = useWalletContext();
  return (
    <TabPanel>
      <Wallets />
      <Transfer walletAddress={activeWalletAddress} />
    </TabPanel>
  );
}

function KycTabPanel() {
  const { activeWalletAddress } = useWalletContext();
  return (
    <TabPanel>
      <Wallets />
      <RampKyc walletAddress={activeWalletAddress} />
    </TabPanel>
  );
}

function RampTabPanel() {
  const { activeWalletAddress, client, solanaWallet } = useWalletContext();
  return (
    <TabPanel>
      <Wallets />
      <Ramp
        walletAddress={activeWalletAddress}
        evmAddress={client?.account.address}
        solanaAddress={solanaWallet?.address}
      />
    </TabPanel>
  );
}

function AppTabContent() {
  const ctx = useWalletContext();
  const walletAddress: string | undefined = ctx.activeWalletAddress ?? undefined;
  const walletEnvironment = ctx.walletEnvironment;
  const selectedEvmChainId =
    walletEnvironment === 'EVM' ? ctx.selectedEvmChainId : undefined;

  return (
    <TabPanel>
      <Wallets />
      <Strategies
        walletAddress={walletAddress}
        walletEnvironment={walletEnvironment}
        selectedEvmChainId={selectedEvmChainId}
      />
    </TabPanel>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'bridge-swap', label: 'Bridge swap' },
  { id: 'swap', label: 'Custom swap' },
  { id: 'ramp', label: 'Ramp catalog' },
  { id: 'pix-onramp', label: 'Pix onramp' },
  { id: 'pix-offramp', label: 'Pix offramp' },
];

const YourApp = () => {
  const { ready, authenticated, user, logout } = usePrivy();
  const routes: Record<string, Tab> = { '/pr-3500/pix': 'pix-onramp', '/pr-3500/ramp': 'ramp', '/pr-3500/custom': 'swap' };
  const [activeTab, setActiveTab] = useState<Tab>(routes[window.location.pathname] ?? 'bridge-swap');

  if (!ready) {
    return (
      <div className="ui-page ui-surface-warm flex min-h-screen items-center justify-center">
        <p className="text-body text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!authenticated) {
    return <Auth />;
  }

  return (
    <div className="ui-page ui-surface-warm min-h-screen py-10">
      <div className="ui-container flex flex-col gap-6">
        <header className="ui-app-bar flex flex-wrap items-center justify-between gap-4">
          <p className="text-body font-medium text-white">
            Hello {user?.email?.address ?? 'User'}
          </p>
          <nav className="flex flex-wrap items-center gap-2">
            <a className="ui-btn-tab ui-btn-tab-inverse" href="/pr-3500">#3500 quotes</a>
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeTab === id}
                onClick={() => { setActiveTab(id); }}
                className={`ui-btn-tab ui-btn-tab-inverse ${activeTab === id ? 'ui-btn-tab-active' : ''}`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="ml-2 text-small font-medium text-white/80 transition-opacity duration-[180ms] hover:opacity-100"
              onClick={() => void logout()}
            >
              Logout
            </button>
          </nav>
        </header>

        {activeTab === 'bridge-swap' ? <PreviewBridgeSwap /> : activeTab === 'pix-onramp' || activeTab === 'pix-offramp' ? (
          <PixRampTab onramp={activeTab === 'pix-onramp'} />
        ) : (
          <WalletProvider>
            <div className="flex w-full gap-6">
              <div className="flex w-full shrink-0 flex-col">
                {activeTab === 'app' && <AppTabContent />}
                {activeTab === 'transfer' && <TransferTabPanel />}
                {activeTab === 'swap' && <SwapTabPanel />}
                {activeTab === 'kyc' && <KycTabPanel />}
                {activeTab === 'ramp' && <RampTabPanel />}
                {activeTab === 'deframe' && (
                  <div className="ui-panel-shell p-6 lg:p-8">
                    <EarnWidgetHost />
                  </div>
                )}
              </div>
            </div>
          </WalletProvider>
        )}
      </div>
    </div>
  );
};

export default YourApp;
