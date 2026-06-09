import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import Auth from '../Auth';
import EarnWidgetHost from '../EarnWidgetHost';
import Strategies from '../Strategies';
import Swap from '../Swap';
import Transfer from '../Transfer/Transfer';
import Wallets from '../Wallets';
import { WalletProvider } from '../Wallets/WalletContext';
import { useWalletContext } from '../Wallets/useWalletContext';

type Tab = 'app' | 'transfer' | 'swap' | 'deframe';

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
  { id: 'app', label: 'Your app' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'swap', label: 'Swap' },
  { id: 'deframe', label: 'Deframe SDK' },
];

const YourApp = () => {
  const { ready, authenticated, user, logout } = usePrivy();
  const [activeTab, setActiveTab] = useState<Tab>('app');

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
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
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

        <WalletProvider>
          <div className="flex w-full gap-6">
            <div className="flex w-full shrink-0 flex-col">
              {activeTab === 'app' && <AppTabContent />}
              {activeTab === 'transfer' && <TransferTabPanel />}
              {activeTab === 'swap' && <SwapTabPanel />}
              {activeTab === 'deframe' && (
                <div className="ui-panel-shell p-6 lg:p-8">
                  <EarnWidgetHost />
                </div>
              )}
            </div>
          </div>
        </WalletProvider>
      </div>
    </div>
  );
};

export default YourApp;
