import { BaseQueryFn } from '@reduxjs/toolkit/query'
import { createApi } from '@reduxjs/toolkit/query/react'
import { SupportedChainId } from 'constants/chains'
import { DocumentNode } from 'graphql'
import { ClientError, gql, GraphQLClient } from 'graphql-request'
import { AppState } from 'state'

// List of supported subgraphs. Note that the app currently only support one active subgraph at a time
const CHAIN_SUBGRAPH_URL: Record<number, string> = {
  [SupportedChainId.MAINNET]: 'https://api.thegraph.com/subgraphs/name/archmage-finance/uniswap-v3',
  [SupportedChainId.RINKEBY]: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3',

  [SupportedChainId.ARBITRUM_ONE]: 'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',

  [SupportedChainId.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-optimism-dev',
}

export const api = createApi({
  reducerPath: 'dataApi',
  baseQuery: graphqlRequestBaseQuery(),
  endpoints: (builder) => ({
    allV3Ticks: builder.query({
      query: ({ poolAddress, skip = 0 }) => ({
        document: gql`
          query allV3Ticks($poolAddress: String!, $skip: Int!) {
            ticks(first: 1000, skip: $skip, where: { poolAddress: $poolAddress }, orderBy: tickIdx) {
              tickIdx
              liquidityNet
              price0
              price1
            }
          }
        `,
        variables: {
          poolAddress,
          skip,
        },
      }),
    }),
    allPositions: builder.query({
      query: ({ owner, poolAddress = '0x', tokenId = '0', num = '1000' }) => ({
        document: gql`
          query allPositions($owner: Bytes!, $poolAddress: String!, $tokenId: ID!, $num: Int!) {
            positions(first: $num, where: { owner_contains: $owner, pool_contains: $poolAddress, id_gte: $tokenId }) {
              id
              liquidity
              amountDepositedUSD
              amountWithdrawnUSD
              amountCollectedUSD
              depositedToken0
              depositedToken1
              withdrawnToken0
              withdrawnToken1
              collectedFeesToken0
              collectedFeesToken1
              feeGrowthInside0LastX128
              feeGrowthInside1LastX128
              transaction {
                timestamp
              }
              tickLower {
                tickIdx
                feeGrowthOutside0X128
                feeGrowthOutside1X128
              }
              tickUpper {
                tickIdx
                feeGrowthOutside0X128
                feeGrowthOutside1X128
              }
              pool {
                feeGrowthGlobal0X128
                feeGrowthGlobal1X128
                tick
                liquidity
                feeTier
                poolDayData(first: 672, skip: 0, orderBy: date, orderDirection: desc) {
                  volumeUSD
                  date
                  token0Price
                  token1Price
                }
              }
              token0 {
                derivedETH
                decimals
              }
              token1 {
                derivedETH
                decimals
              }
            }
          }
        `,
        variables: {
          owner,
          poolAddress,
          tokenId,
          num,
        },
      }),
    }),
    feeTierDistribution: builder.query({
      query: ({ token0, token1 }) => ({
        document: gql`
          query feeTierDistribution($token0: String!, $token1: String!) {
            _meta {
              block {
                number
              }
            }
            asToken0: pools(
              orderBy: totalValueLockedToken0
              orderDirection: desc
              where: { token0: $token0, token1: $token1 }
            ) {
              feeTier
              totalValueLockedToken0
              totalValueLockedToken1
            }
            asToken1: pools(
              orderBy: totalValueLockedToken0
              orderDirection: desc
              where: { token0: $token1, token1: $token0 }
            ) {
              feeTier
              totalValueLockedToken0
              totalValueLockedToken1
            }
          }
        `,
        variables: {
          token0,
          token1,
        },
      }),
    }),
  }),
})

// Graphql query client wrapper that builds a dynamic url based on chain id
function graphqlRequestBaseQuery(): BaseQueryFn<
  { document: string | DocumentNode; variables?: any },
  unknown,
  Pick<ClientError, 'name' | 'message' | 'stack'>,
  Partial<Pick<ClientError, 'request' | 'response'>>
> {
  return async ({ document, variables }, { getState }) => {
    try {
      const chainId = (getState() as AppState).application.chainId

      const subgraphUrl = chainId ? CHAIN_SUBGRAPH_URL[chainId] : undefined

      if (!subgraphUrl) {
        return {
          error: {
            name: 'UnsupportedChainId',
            message: `Subgraph queries against ChainId ${chainId} are not supported.`,
            stack: '',
          },
        }
      }

      return { data: await new GraphQLClient(subgraphUrl).request(document, variables), meta: {} }
    } catch (error) {
      if (error instanceof ClientError) {
        const { name, message, stack, request, response } = error
        return { error: { name, message, stack }, meta: { request, response } }
      }
      throw error
    }
  }
}
