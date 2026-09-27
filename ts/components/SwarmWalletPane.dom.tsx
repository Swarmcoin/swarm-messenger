// Copyright 2026 SWARM
// SPDX-License-Identifier: AGPL-3.0-only
//
// SWARM addition (M3 wave 1): the Wallet pane.
//
// Presentational only: it draws the state the wallet service reports and hands
// the person's intentions back through callbacks. It holds no key and no seed,
// and it never writes an address or an amount to a log. The one secret it ever
// touches is the recovery phrase typed into the restore form, which goes
// straight to the callback and is cleared from the field.
//
// Sending takes two deliberate steps: "Review payment" asks the wallet for a
// quote (nothing moves), and only the button on the confirmation screen, which
// names the amount, the fee and the address, sends.

import { useCallback, useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { tw } from '../axo/tw.dom.tsx';
import { AxoButton } from '../axo/AxoButton.dom.tsx';
import { QrCode } from './QrCode.dom.tsx';
import {
  formatZatoshiAsSwm,
  parseSwmAmount,
  zatoshiFromString,
} from '../util/swarm/swmAmount.std.ts';
import { explorerTransactionUrl } from '../types/SwarmWallet.std.ts';
import type { LocalizerType } from '../types/Util.std.ts';
import type {
  ConfirmSendResultType,
  QuoteSendResultType,
  SendQuoteType,
  SendRefusalType,
  SwarmWalletNetworkIdType,
  SwarmWalletProblemType,
  SwarmWalletStateType,
  SwarmWalletTransactionType,
} from '../types/SwarmWallet.std.ts';

export type SwarmWalletPaneProps = Readonly<{
  i18n: LocalizerType;
  /** Undefined until the wallet service has answered once. */
  state: SwarmWalletStateType | undefined;
  onRestore: (phrase: string) => Promise<SwarmWalletProblemType | null>;
  onRetry: () => void;
  onQuote: (request: {
    to: string;
    amount: string;
    memo: string;
  }) => Promise<QuoteSendResultType>;
  onConfirm: (quoteId: string) => Promise<ConfirmSendResultType>;
  onCancelQuote: () => void;
  onSetNetwork: (network: SwarmWalletNetworkIdType) => void;
  onCopyAddress: (address: string) => void;
}>;

export function SwarmWalletPane(props: SwarmWalletPaneProps): JSX.Element {
  const { i18n, state } = props;

  return (
    <div
      data-testid="SwarmWalletPane"
      data-wallet-status={state?.status ?? 'loading'}
      className={tw('flex size-full flex-col overflow-y-auto')}
    >
      <div className={tw('mx-auto flex w-full max-w-160 flex-col gap-6 p-6')}>
        <Header i18n={i18n} state={state} />
        <Body {...props} />
        {state?.canSwitchNetwork === true ? (
          <DeveloperNetwork
            i18n={i18n}
            network={state.network.id}
            onSetNetwork={props.onSetNetwork}
          />
        ) : null}
      </div>
    </div>
  );
}

function Body(props: SwarmWalletPaneProps): JSX.Element {
  const { i18n, state } = props;

  if (state == null) {
    return <Notice testId="loading">{i18n('icu:SwarmWallet__loading')}</Notice>;
  }

  switch (state.status) {
    case 'unavailable':
      return (
        <Notice testId="unavailable">
          {i18n('icu:SwarmWallet__unavailable')}
        </Notice>
      );
    case 'opening':
      return (
        <Notice testId="opening">{i18n('icu:SwarmWallet__opening')}</Notice>
      );
    case 'no-wallet':
      return <RestoreForm i18n={i18n} onRestore={props.onRestore} />;
    case 'offline':
      return <Offline {...props} state={state} />;
    case 'error':
      return (
        <section data-testid="error" className={tw('flex flex-col gap-3')}>
          <p className={tw('type-body-medium text-primary')}>
            {problemText(i18n, state)}
          </p>
          <div>
            <AxoButton.Root
              variant="subtle-secondary"
              size="md"
              onClick={props.onRetry}
            >
              {i18n('icu:SwarmWallet__retry')}
            </AxoButton.Root>
          </div>
        </section>
      );
    case 'ready':
      return <Ready {...props} state={state} />;
    default:
      return (
        <Notice testId="error">
          {i18n('icu:SwarmWallet__error--unexpected')}
        </Notice>
      );
  }
}

// Header -----------------------------------------------------------------------

function Header({
  i18n,
  state,
}: {
  i18n: LocalizerType;
  state: SwarmWalletStateType | undefined;
}): JSX.Element {
  return (
    <header className={tw('flex flex-col gap-1')}>
      <h1 className={tw('type-title-large text-primary')}>
        {i18n('icu:SwarmWallet__title')}
      </h1>
      {state != null ? (
        <>
          <p
            data-testid="network"
            className={tw('type-body-medium text-primary')}
          >
            {state.network.id === 'mainnet'
              ? i18n('icu:SwarmWallet__network--mainnet')
              : i18n('icu:SwarmWallet__network--testnet')}
          </p>
          <p className={tw('type-body-small text-secondary')}>
            {i18n('icu:SwarmWallet__server', {
              server: state.network.server,
            })}
          </p>
          {state.status === 'ready' && state.serverHeight != null ? (
            <p
              data-testid="height"
              className={tw('type-body-small text-secondary')}
            >
              {i18n('icu:SwarmWallet__height', { height: state.serverHeight })}
              {' · '}
              {syncText(i18n, state)}
              {' · '}
              {state.genesisVerified === true
                ? i18n('icu:SwarmWallet__genesis--verified')
                : i18n('icu:SwarmWallet__genesis--unstated')}
            </p>
          ) : null}
        </>
      ) : null}
    </header>
  );
}

function syncText(i18n: LocalizerType, state: SwarmWalletStateType): string {
  const { serverHeight, syncedHeight } = state;
  if (
    serverHeight != null &&
    syncedHeight != null &&
    syncedHeight >= serverHeight
  ) {
    return i18n('icu:SwarmWallet__synced');
  }
  if (serverHeight != null && syncedHeight != null) {
    return i18n('icu:SwarmWallet__syncing', {
      synced: syncedHeight,
      height: serverHeight,
    });
  }
  return i18n('icu:SwarmWallet__syncing--starting');
}

// States --------------------------------------------------------------------------

function Notice({
  children,
  testId,
}: {
  children: ReactNode;
  testId: string;
}): JSX.Element {
  return (
    <p data-testid={testId} className={tw('type-body-medium text-secondary')}>
      {children}
    </p>
  );
}

function problemText(i18n: LocalizerType, state: SwarmWalletStateType): string {
  switch (state.problem) {
    case 'wrong-chain':
      return i18n('icu:SwarmWallet__error--wrong-chain', {
        server: state.network.server,
      });
    case 'wallet-file':
      return i18n('icu:SwarmWallet__error--wallet-file');
    case 'addon-missing':
      return i18n('icu:SwarmWallet__unavailable');
    default:
      return i18n('icu:SwarmWallet__error--unexpected');
  }
}

function Offline({
  i18n,
  state,
  onRetry,
}: SwarmWalletPaneProps & { state: SwarmWalletStateType }): JSX.Element {
  return (
    <section data-testid="offline" className={tw('flex flex-col gap-3')}>
      <h2 className={tw('type-title-medium text-primary')}>
        {i18n('icu:SwarmWallet__offline--title')}
      </h2>
      <p className={tw('type-body-medium text-primary')}>
        {i18n('icu:SwarmWallet__offline--body', {
          server: state.network.server,
        })}
      </p>
      <div>
        <AxoButton.Root variant="subtle-secondary" size="md" onClick={onRetry}>
          {i18n('icu:SwarmWallet__retry')}
        </AxoButton.Root>
      </div>
      {state.balance != null ? (
        <Card title={i18n('icu:SwarmWallet__offline--last-known')}>
          <BalanceRows i18n={i18n} state={state} />
        </Card>
      ) : null}
    </section>
  );
}

function RestoreForm({
  i18n,
  onRestore,
}: {
  i18n: LocalizerType;
  onRestore: (phrase: string) => Promise<SwarmWalletProblemType | null>;
}): JSX.Element {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SwarmWalletProblemType | null>(null);

  const wordCount =
    phrase.trim() === '' ? 0 : phrase.trim().split(/\s+/u).length;

  const submit = async () => {
    if (busy || wordCount !== 24) {
      return;
    }
    setBusy(true);
    setProblem(null);
    const typed = phrase;
    // The words leave the field as they leave for the main process.
    setPhrase('');
    let answer: SwarmWalletProblemType | null;
    try {
      answer = await onRestore(typed);
    } catch {
      answer = 'unexpected';
    }
    setProblem(answer);
    setBusy(false);
  };

  return (
    <section data-testid="no-wallet" className={tw('flex flex-col gap-3')}>
      <h2 className={tw('type-title-medium text-primary')}>
        {i18n('icu:SwarmWallet__restore--title')}
      </h2>
      <p className={tw('type-body-medium text-secondary')}>
        {i18n('icu:SwarmWallet__restore--body')}
      </p>
      <textarea
        aria-label={i18n('icu:SwarmWallet__restore--placeholder')}
        className={tw(
          'h-28 w-full resize-none rounded-lg border border-primary',
          'bg-surface-primary p-3 type-body-medium text-primary'
        )}
        disabled={busy}
        placeholder={i18n('icu:SwarmWallet__restore--placeholder')}
        spellCheck={false}
        autoComplete="off"
        value={phrase}
        onChange={event => setPhrase(event.target.value)}
      />
      {problem != null ? (
        <p className={tw('type-body-medium text-destructive')}>
          {problem === 'wrong-phrase'
            ? i18n('icu:SwarmWallet__restore--wrong-phrase')
            : i18n('icu:SwarmWallet__restore--invalid-phrase')}
        </p>
      ) : null}
      <div>
        <AxoButton.Root
          variant="strong-primary"
          size="md"
          disabled={wordCount !== 24}
          pending={busy}
          onClick={() => {
            void submit();
          }}
        >
          {i18n('icu:SwarmWallet__restore--button')}
        </AxoButton.Root>
      </div>
    </section>
  );
}

// Ready -------------------------------------------------------------------------

function Ready(
  props: SwarmWalletPaneProps & { state: SwarmWalletStateType }
): JSX.Element {
  const { i18n, state } = props;
  return (
    <div data-testid="ready" className={tw('flex flex-col gap-6')}>
      <Card title={i18n('icu:SwarmWallet__balance--title')}>
        <BalanceRows i18n={i18n} state={state} />
        {state.encryptedAtRest === false ? (
          <p className={tw('type-body-small text-destructive')}>
            {i18n('icu:SwarmWallet__not-encrypted')}
          </p>
        ) : null}
      </Card>
      {state.address != null ? (
        <Receive
          i18n={i18n}
          address={state.address}
          onCopyAddress={props.onCopyAddress}
        />
      ) : null}
      <Send {...props} />
      <History i18n={i18n} state={state} />
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className={tw('flex flex-col gap-3 rounded-lg bg-surface-secondary p-4')}
    >
      <h2 className={tw('type-title-small text-primary')}>{title}</h2>
      {children}
    </section>
  );
}

function Amount({
  i18n,
  zatoshi,
  testId,
}: {
  i18n: LocalizerType;
  zatoshi: bigint;
  testId?: string;
}): JSX.Element {
  return (
    <span data-testid={testId} className={tw('font-swarm-mono text-primary')}>
      {i18n('icu:SwarmWallet__amount', {
        amount: formatZatoshiAsSwm(zatoshi),
      })}
    </span>
  );
}

function BalanceRows({
  i18n,
  state,
}: {
  i18n: LocalizerType;
  state: SwarmWalletStateType;
}): JSX.Element | null {
  if (state.balance == null) {
    return null;
  }
  return (
    <dl className={tw('grid grid-cols-[auto_1fr] gap-x-6 gap-y-1')}>
      <dt className={tw('type-body-medium text-secondary')}>
        {i18n('icu:SwarmWallet__balance--confirmed')}
      </dt>
      <dd className={tw('type-title-medium')}>
        <Amount
          i18n={i18n}
          testId="balance-confirmed"
          zatoshi={zatoshiFromString(state.balance.confirmedZat)}
        />
      </dd>
      <dt className={tw('type-body-medium text-secondary')}>
        {i18n('icu:SwarmWallet__balance--pending')}
      </dt>
      <dd className={tw('type-body-medium')}>
        <Amount
          i18n={i18n}
          testId="balance-pending"
          zatoshi={zatoshiFromString(state.balance.pendingZat)}
        />
      </dd>
    </dl>
  );
}

function Receive({
  i18n,
  address,
  onCopyAddress,
}: {
  i18n: LocalizerType;
  address: string;
  onCopyAddress: (address: string) => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Card title={i18n('icu:SwarmWallet__receive--title')}>
      <p className={tw('type-body-small text-secondary')}>
        {i18n('icu:SwarmWallet__receive--body')}
      </p>
      <div className={tw('flex flex-wrap items-start gap-4')}>
        <div className={tw('shrink-0 rounded-md bg-[white] p-2')}>
          <QrCode
            alt={i18n('icu:SwarmWallet__receive--qr')}
            className={tw('size-40')}
            data={address}
          />
        </div>
        <div className={tw('flex min-w-0 flex-1 flex-col gap-2')}>
          <code
            data-testid="address"
            className={tw(
              'font-swarm-mono type-body-small break-all text-primary select-text'
            )}
          >
            {address}
          </code>
          <div>
            <AxoButton.Root
              variant="subtle-secondary"
              size="sm"
              onClick={() => {
                onCopyAddress(address);
                setCopied(true);
              }}
            >
              {copied
                ? i18n('icu:SwarmWallet__copied')
                : i18n('icu:SwarmWallet__copy')}
            </AxoButton.Root>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Sending ------------------------------------------------------------------------

type SendStepType =
  | { step: 'form' }
  | { step: 'quoting' }
  | { step: 'confirm'; quote: SendQuoteType }
  | { step: 'sending'; quote: SendQuoteType }
  | { step: 'sent'; txids: ReadonlyArray<string>; saved: boolean };

function Send({
  i18n,
  state,
  onQuote,
  onConfirm,
  onCancelQuote,
}: SwarmWalletPaneProps & { state: SwarmWalletStateType }): JSX.Element {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [step, setStep] = useState<SendStepType>({ step: 'form' });
  const [refusal, setRefusal] = useState<string | null>(null);

  const review = useCallback(async () => {
    setRefusal(null);
    // What can be said without asking the wallet, is said without asking it.
    if (to.trim() === '') {
      setRefusal(i18n('icu:SwarmWallet__refusal--empty-address'));
      return;
    }
    const parsed = parseSwmAmount(amount);
    if (!parsed.ok) {
      setRefusal(amountProblemText(i18n, parsed.problem));
      return;
    }
    setStep({ step: 'quoting' });
    try {
      const result = await onQuote({ to: to.trim(), amount, memo });
      if (result.ok) {
        setStep({ step: 'confirm', quote: result.quote });
      } else {
        setStep({ step: 'form' });
        setRefusal(refusalText(i18n, result.refusal));
      }
    } catch {
      setStep({ step: 'form' });
      setRefusal(i18n('icu:SwarmWallet__refusal--rejected'));
    }
  }, [amount, i18n, memo, onQuote, to]);

  const send = useCallback(
    async (quote: SendQuoteType) => {
      setStep({ step: 'sending', quote });
      try {
        const result = await onConfirm(quote.quoteId);
        if (result.ok) {
          setStep({ step: 'sent', txids: result.txids, saved: result.saved });
          setTo('');
          setAmount('');
          setMemo('');
        } else {
          setStep({ step: 'form' });
          setRefusal(refusalText(i18n, result.refusal));
        }
      } catch {
        setStep({ step: 'form' });
        setRefusal(i18n('icu:SwarmWallet__refusal--rejected'));
      }
    },
    [i18n, onConfirm]
  );

  if (step.step === 'confirm' || step.step === 'sending') {
    const { quote } = step;
    const sending = step.step === 'sending';
    return (
      <Card title={i18n('icu:SwarmWallet__confirm--title')}>
        <dl
          data-testid="send-confirm"
          className={tw('grid grid-cols-[auto_1fr] gap-x-6 gap-y-2')}
        >
          <dt className={tw('type-body-medium text-secondary')}>
            {i18n('icu:SwarmWallet__confirm--to')}
          </dt>
          <dd
            className={tw(
              'font-swarm-mono type-body-small break-all text-primary'
            )}
          >
            {quote.to}
          </dd>
          <dt className={tw('type-body-medium text-secondary')}>
            {i18n('icu:SwarmWallet__confirm--amount')}
          </dt>
          <dd>
            <Amount i18n={i18n} zatoshi={zatoshiFromString(quote.amountZat)} />
          </dd>
          <dt className={tw('type-body-medium text-secondary')}>
            {i18n('icu:SwarmWallet__confirm--fee')}
          </dt>
          <dd>
            <Amount i18n={i18n} zatoshi={zatoshiFromString(quote.feeZat)} />
          </dd>
          <dt className={tw('type-body-medium text-secondary')}>
            {i18n('icu:SwarmWallet__confirm--total')}
          </dt>
          <dd>
            <Amount i18n={i18n} zatoshi={zatoshiFromString(quote.totalZat)} />
          </dd>
          {quote.memo != null ? (
            <>
              <dt className={tw('type-body-medium text-secondary')}>
                {i18n('icu:SwarmWallet__confirm--memo')}
              </dt>
              <dd
                className={tw('type-body-medium wrap-break-word text-primary')}
              >
                {quote.memo}
              </dd>
            </>
          ) : null}
        </dl>
        <p className={tw('type-body-medium text-primary')}>
          {i18n('icu:SwarmWallet__confirm--warning')}
        </p>
        {sending ? (
          <p className={tw('type-body-small text-secondary')}>
            {i18n('icu:SwarmWallet__sending')}
          </p>
        ) : null}
        <div className={tw('flex flex-wrap gap-2')}>
          <AxoButton.Root
            variant="strong-primary"
            size="md"
            pending={sending}
            onClick={() => {
              if (sending) {
                return;
              }
              void send(quote);
            }}
          >
            {i18n('icu:SwarmWallet__confirm--send', {
              amount: formatZatoshiAsSwm(zatoshiFromString(quote.totalZat)),
            })}
          </AxoButton.Root>
          <AxoButton.Root
            variant="subtle-secondary"
            size="md"
            disabled={sending}
            onClick={() => {
              onCancelQuote();
              setStep({ step: 'form' });
            }}
          >
            {i18n('icu:SwarmWallet__confirm--back')}
          </AxoButton.Root>
        </div>
      </Card>
    );
  }

  if (step.step === 'sent') {
    return (
      <Card title={i18n('icu:SwarmWallet__sent--title')}>
        <div data-testid="send-result" className={tw('flex flex-col gap-2')}>
          {step.txids.map(txid => (
            <div key={txid} className={tw('flex flex-col gap-1')}>
              <code
                className={tw(
                  'font-swarm-mono type-body-small break-all text-primary select-text'
                )}
              >
                {i18n('icu:SwarmWallet__sent--txid', { txid })}
              </code>
              <a
                className={tw('type-body-medium text-accent underline')}
                href={explorerTransactionUrl(state.network.explorer, txid)}
                target="_blank"
                rel="noreferrer"
              >
                {i18n('icu:SwarmWallet__sent--explorer')}
              </a>
            </div>
          ))}
          {!step.saved ? (
            <p className={tw('type-body-small text-secondary')}>
              {i18n('icu:SwarmWallet__sent--not-saved')}
            </p>
          ) : null}
          <div>
            <AxoButton.Root
              variant="subtle-secondary"
              size="md"
              onClick={() => setStep({ step: 'form' })}
            >
              {i18n('icu:SwarmWallet__sent--done')}
            </AxoButton.Root>
          </div>
        </div>
      </Card>
    );
  }

  const quoting = step.step === 'quoting';
  const fieldClass = tw(
    'w-full rounded-lg border border-primary bg-surface-primary p-2',
    'type-body-medium text-primary'
  );

  return (
    <Card title={i18n('icu:SwarmWallet__send--title')}>
      <form
        data-testid="send-form"
        className={tw('flex flex-col gap-3')}
        onSubmit={event => {
          // Nothing is sent from the keyboard: review is a button press.
          event.preventDefault();
        }}
      >
        <label className={tw('flex flex-col gap-1')}>
          <span className={tw('type-body-small text-secondary')}>
            {i18n('icu:SwarmWallet__send--to')}
          </span>
          <input
            name="to"
            className={tw(fieldClass, 'font-swarm-mono')}
            disabled={quoting}
            placeholder={i18n('icu:SwarmWallet__send--to-placeholder')}
            spellCheck={false}
            autoComplete="off"
            value={to}
            onChange={event => setTo(event.target.value)}
          />
        </label>
        <label className={tw('flex flex-col gap-1')}>
          <span className={tw('type-body-small text-secondary')}>
            {i18n('icu:SwarmWallet__send--amount')}
          </span>
          <input
            name="amount"
            className={tw(fieldClass, 'font-swarm-mono')}
            disabled={quoting}
            inputMode="decimal"
            placeholder="0.00000000"
            spellCheck={false}
            autoComplete="off"
            value={amount}
            onChange={event => setAmount(event.target.value)}
          />
        </label>
        <label className={tw('flex flex-col gap-1')}>
          <span className={tw('type-body-small text-secondary')}>
            {i18n('icu:SwarmWallet__send--memo')}
          </span>
          <textarea
            name="memo"
            className={tw(fieldClass, 'h-16 resize-none')}
            disabled={quoting}
            spellCheck={false}
            value={memo}
            onChange={event => setMemo(event.target.value)}
          />
        </label>
        {refusal != null ? (
          <p
            data-testid="send-refusal"
            role="alert"
            className={tw('type-body-medium text-destructive')}
          >
            {refusal}
          </p>
        ) : null}
        <div>
          <AxoButton.Root
            variant="strong-primary"
            size="md"
            pending={quoting}
            onClick={() => {
              if (quoting) {
                return;
              }
              void review();
            }}
          >
            {i18n('icu:SwarmWallet__send--review')}
          </AxoButton.Root>
        </div>
      </form>
    </Card>
  );
}

function amountProblemText(
  i18n: LocalizerType,
  problem: string | null
): string {
  switch (problem) {
    case 'empty':
      return i18n('icu:SwarmWallet__refusal--empty-amount');
    case 'negative':
      return i18n('icu:SwarmWallet__refusal--negative');
    case 'too-many-decimals':
      return i18n('icu:SwarmWallet__refusal--too-many-decimals');
    case 'zero':
      return i18n('icu:SwarmWallet__refusal--zero');
    case 'too-large':
      return i18n('icu:SwarmWallet__refusal--too-large');
    case 'not-a-number':
    default:
      return i18n('icu:SwarmWallet__refusal--not-a-number');
  }
}

/** The plain-words sentence for a refused payment. */
export function refusalText(
  i18n: LocalizerType,
  refusal: SendRefusalType
): string {
  switch (refusal.kind) {
    case 'invalid-address':
      // The wallet's own sentence names the network the address belongs to.
      return (
        refusal.detail ?? i18n('icu:SwarmWallet__refusal--invalid-address')
      );
    case 'invalid-amount':
      return amountProblemText(i18n, refusal.detail);
    case 'invalid-memo':
      return refusal.detail === 'transparent'
        ? i18n('icu:SwarmWallet__refusal--memo-transparent')
        : i18n('icu:SwarmWallet__refusal--memo-too-long');
    case 'insufficient-funds':
      if (refusal.needZat != null && refusal.haveZat != null) {
        return i18n('icu:SwarmWallet__refusal--insufficient', {
          need: formatZatoshiAsSwm(zatoshiFromString(refusal.needZat)),
          have: formatZatoshiAsSwm(zatoshiFromString(refusal.haveZat)),
        });
      }
      return i18n('icu:SwarmWallet__refusal--insufficient-plain');
    case 'not-ready':
      return i18n('icu:SwarmWallet__refusal--not-ready');
    case 'offline':
      return i18n('icu:SwarmWallet__refusal--offline');
    case 'quote-expired':
      return i18n('icu:SwarmWallet__refusal--quote-expired');
    case 'rejected':
    default:
      return i18n('icu:SwarmWallet__refusal--rejected');
  }
}

// History -------------------------------------------------------------------------

function History({
  i18n,
  state,
}: {
  i18n: LocalizerType;
  state: SwarmWalletStateType;
}): JSX.Element {
  return (
    <Card title={i18n('icu:SwarmWallet__history--title')}>
      {state.transactions.length === 0 ? (
        <p
          data-testid="history-empty"
          className={tw('type-body-medium text-secondary')}
        >
          {i18n('icu:SwarmWallet__history--empty')}
        </p>
      ) : (
        <ul data-testid="history" className={tw('flex flex-col gap-3')}>
          {state.transactions.map(transaction => (
            <HistoryRow
              key={transaction.txid}
              i18n={i18n}
              explorer={state.network.explorer}
              transaction={transaction}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function HistoryRow({
  i18n,
  explorer,
  transaction,
}: {
  i18n: LocalizerType;
  explorer: string;
  transaction: SwarmWalletTransactionType;
}): JSX.Element {
  const { label, sign } = directionText(i18n, transaction.direction);
  return (
    <li className={tw('flex flex-col gap-0.5')}>
      <div
        className={tw('flex flex-wrap items-baseline justify-between gap-2')}
      >
        <span className={tw('type-body-medium text-primary')}>{label}</span>
        <span className={tw('font-swarm-mono type-body-medium text-primary')}>
          {sign}
          {i18n('icu:SwarmWallet__amount', {
            amount: formatZatoshiAsSwm(
              zatoshiFromString(transaction.amountZat)
            ),
          })}
        </span>
      </div>
      <div
        className={tw('flex flex-wrap items-baseline justify-between gap-2')}
      >
        <span className={tw('type-body-small text-secondary')}>
          {transaction.blockHeight == null
            ? i18n('icu:SwarmWallet__history--pending')
            : i18n('icu:SwarmWallet__history--block', {
                height: transaction.blockHeight,
              })}
        </span>
        <a
          className={tw(
            'font-swarm-mono type-body-small text-accent underline'
          )}
          href={explorerTransactionUrl(explorer, transaction.txid)}
          target="_blank"
          rel="noreferrer"
        >
          {`${transaction.txid.slice(0, 10)}…${transaction.txid.slice(-6)}`}
        </a>
      </div>
      {transaction.memo != null && transaction.memo !== '' ? (
        <p className={tw('type-body-small wrap-break-word text-secondary')}>
          {transaction.memo}
        </p>
      ) : null}
    </li>
  );
}

function directionText(
  i18n: LocalizerType,
  direction: SwarmWalletTransactionType['direction']
): { label: string; sign: string } {
  switch (direction) {
    case 'in':
      return { label: i18n('icu:SwarmWallet__history--received'), sign: '+' };
    case 'out':
      return { label: i18n('icu:SwarmWallet__history--sent'), sign: '−' };
    default:
      // A spend shown as income is the bug this avoids: unknown stays unknown.
      return { label: i18n('icu:SwarmWallet__history--unknown'), sign: '' };
  }
}

// Developer ------------------------------------------------------------------------

function DeveloperNetwork({
  i18n,
  network,
  onSetNetwork,
}: {
  i18n: LocalizerType;
  network: SwarmWalletNetworkIdType;
  onSetNetwork: (network: SwarmWalletNetworkIdType) => void;
}): JSX.Element {
  return (
    <section
      data-testid="developer-network"
      className={tw(
        'flex flex-col gap-2 rounded-lg border border-dashed border-primary p-4'
      )}
    >
      <h2 className={tw('type-body-small text-secondary')}>
        {i18n('icu:SwarmWallet__developer--title')}
      </h2>
      <div className={tw('flex gap-2')}>
        <AxoButton.Root
          variant={
            network === 'mainnet' ? 'strong-secondary' : 'implied-secondary'
          }
          size="sm"
          onClick={() => onSetNetwork('mainnet')}
        >
          {i18n('icu:SwarmWallet__developer--mainnet')}
        </AxoButton.Root>
        <AxoButton.Root
          variant={
            network === 'testnet' ? 'strong-secondary' : 'implied-secondary'
          }
          size="sm"
          onClick={() => onSetNetwork('testnet')}
        >
          {i18n('icu:SwarmWallet__developer--testnet')}
        </AxoButton.Root>
      </div>
    </section>
  );
}
