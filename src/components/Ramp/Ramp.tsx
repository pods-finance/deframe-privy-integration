import RampQuotes from './RampQuotes';

interface Props {
  walletAddress?: string;
  evmAddress?: string;
  solanaAddress?: string;
}

const Ramp = ({ walletAddress, evmAddress, solanaAddress }: Props) => {
  return (
    <RampQuotes
      walletAddress={walletAddress}
      evmAddress={evmAddress}
      solanaAddress={solanaAddress}
    />
  );
};

export default Ramp;
