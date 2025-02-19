import React, { createContext } from 'react';
import { defaultTo } from 'lodash';
import * as R from 'ramda';
import { useGetBankTransactionsMatches } from '@/hooks/query/bank-rules';

interface MatchingTransactionBootValues {
  isMatchingTransactionsLoading: boolean;
  isMatchingTransactionsFetching: boolean;
  isMatchingTransactionsSuccess: boolean;
  possibleMatches: Array<any>;
  perfectMatchesCount: number;
  perfectMatches: Array<any>;
  matches: Array<any>;
}

const RuleFormBootContext = createContext<MatchingTransactionBootValues>(
  {} as MatchingTransactionBootValues,
);

interface RuleFormBootProps {
  uncategorizedTransactionId: number;
  children: React.ReactNode;
}

function MatchingTransactionBoot({
  uncategorizedTransactionId,
  ...props
}: RuleFormBootProps) {
  const {
    data: matchingTransactions,
    isLoading: isMatchingTransactionsLoading,
    isFetching: isMatchingTransactionsFetching,
    isSuccess: isMatchingTransactionsSuccess,
  } = useGetBankTransactionsMatches(uncategorizedTransactionId);

  const possibleMatches = defaultTo(matchingTransactions?.possibleMatches, []);
  const perfectMatchesCount = matchingTransactions?.perfectMatches?.length || 0;
  const perfectMatches = defaultTo(matchingTransactions?.perfectMatches, []);

  const matches = R.concat(perfectMatches, possibleMatches);

  const provider = {
    isMatchingTransactionsLoading,
    isMatchingTransactionsFetching,
    isMatchingTransactionsSuccess,
    possibleMatches,
    perfectMatchesCount,
    perfectMatches,
    matches,
  } as MatchingTransactionBootValues;

  return <RuleFormBootContext.Provider value={provider} {...props} />;
}

const useMatchingTransactionBoot = () =>
  React.useContext<MatchingTransactionBootValues>(RuleFormBootContext);

export { MatchingTransactionBoot, useMatchingTransactionBoot };
