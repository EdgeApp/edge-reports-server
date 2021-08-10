const date = new Date(Date.now())

export const fixtures = {
  createQuarterBuckets: {
    'Check empty month buckets': {
      test: {
        result: {
          hour: [],
          day: [],
          month: [],
          numAllTxs: 0
        },
        app: 'shsrth',
        pluginId: 'erthe',
        start: date.getTime() - 100000,
        end: date.getTime()
      },
      expected: [
        {
          start: 0,
          usdValue: 0,
          numTxs: 0,
          isoDate: date.toISOString(),
          currencyCodes: {},
          currencyPairs: {}
        }
      ]
    }
  },
  movingAveDataSort: [
    {
      testDescription:
        'Returns 7-day weighted data when given over 7 days of data',
      inputData: [
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 125,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-2',
          allUsd: 102201,
          allTxs: 126,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-3',
          allUsd: 102201,
          allTxs: 127,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-4',
          allUsd: 102201,
          allTxs: 128,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-5',
          allUsd: 102201,
          allTxs: 129,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-6',
          allUsd: 102201,
          allTxs: 130,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-7',
          allUsd: 102201,
          allTxs: 131,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-8',
          allUsd: 102201,
          allTxs: 132,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-9',
          allUsd: 102201,
          allTxs: 133,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        }
      ],
      outputType: 'array',
      expectedOutput: [
        { date: '2021-7-1', allUsd: 14600 },
        { date: '2021-7-2', allUsd: 29200 },
        { date: '2021-7-3', allUsd: 43800 },
        { date: '2021-7-4', allUsd: 58401 },
        { date: '2021-7-5', allUsd: 73001 },
        { date: '2021-7-6', allUsd: 87601 },
        { date: '2021-7-7', allUsd: 102201 },
        { date: '2021-7-8', allUsd: 102201 },
        { date: '2021-7-9', allUsd: 102201 }
      ]
    },
    {
      testDescription:
        'Returns 7-day weighted data when given less than 7 days of data',
      inputData: [
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 125,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-2',
          allUsd: 102201,
          allTxs: 126,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-3',
          allUsd: 102201,
          allTxs: 127,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-4',
          allUsd: 102201,
          allTxs: 128,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        }
      ],
      outputType: 'array',
      expectedOutput: [
        { date: '2021-7-1', allUsd: 14600 },
        { date: '2021-7-2', allUsd: 29200 },
        { date: '2021-7-3', allUsd: 43800 },
        { date: '2021-7-4', allUsd: 58401 }
      ]
    },
    {
      testDescription: 'Returns empty array when given empty array',
      inputData: [],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given a random string',
      inputData: 'random string',
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given a number',
      inputData: 5758934758,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given a boolean',
      inputData: false,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given undefined',
      inputData: undefined,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given NaN',
      inputData: NaN,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given null',
      inputData: null,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given an array of numbers',
      inputData: [123, 456, 789],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription:
        'Returns Empty Array when given an array with random data',
      inputData: ['ehlisnlkjsb', 122313432, true, false, NaN, undefined, null],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription:
        'Returns Empty Array when given an array with random objects',
      inputData: [
        { hello: 'sahbdksdb' },
        { error: 123435 },
        { broken: undefined }
      ],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription:
        'Returns Empty Array when given an array with a mixture of good and bad objects',
      inputData: [
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 125,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-2',
          allUsd: 102201,
          allTxs: 126,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        { Error: 'bad Data' },
        { Broken: 589384 }
      ],
      outputType: 'array',
      expectedOutput: []
    }
  ],
  sevenDayDataMerge: [
    {
      testDescription:
        'Returns merged 7-day weighted data with current data and removes unnecessary data',
      inputData: [
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 125,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-2',
          allUsd: 103500,
          allTxs: 126,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-3',
          allUsd: 100010,
          allTxs: 127,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-4',
          allUsd: 101500,
          allTxs: 128,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-5',
          allUsd: 120000,
          allTxs: 129,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-6',
          allUsd: 100300,
          allTxs: 130,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-7',
          allUsd: 101111,
          allTxs: 131,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-8',
          allUsd: 104560,
          allTxs: 132,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-9',
          allUsd: 111222,
          allTxs: 133,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        }
      ],
      outputType: 'array',
      expectedOutput: [
        {
          date: '2021-7-7',
          allUsd: 101111,
          allTxs: 131,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          },
          sevenDayAve: 104089
        },
        {
          date: '2021-7-8',
          allUsd: 104560,
          allTxs: 132,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          },
          sevenDayAve: 104426
        },
        {
          date: '2021-7-9',
          allUsd: 111222,
          allTxs: 133,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          },
          sevenDayAve: 105529
        }
      ]
    },
    {
      testDescription:
        'Returns empty array when given less than 7 days of data',
      inputData: [
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 125,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-2',
          allUsd: 102201,
          allTxs: 126,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-3',
          allUsd: 102201,
          allTxs: 127,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        }
      ],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns empty array when given empty array',
      inputData: [],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given a random string',
      inputData: 'random string',
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given a number',
      inputData: 5758934758,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given a boolean',
      inputData: false,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given undefined',
      inputData: undefined,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given NaN',
      inputData: NaN,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given null',
      inputData: null,
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription: 'Returns Empty Array when given an array of numbers',
      inputData: [123, 456, 789],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription:
        'Returns Empty Array when given an array with random data',
      inputData: ['ehlisnlkjsb', 122313432, true, false, NaN, undefined, null],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription:
        'Returns Empty Array when given an array with random objects',
      inputData: [
        { hello: 'sahbdksdb' },
        { error: 123435 },
        { broken: undefined }
      ],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription:
        'Returns Empty Array when given an array with a mixture of good and bad objects',
      inputData: [
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 125,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-2',
          allUsd: 102201,
          allTxs: 126,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        { Error: 'bad Data' },
        { Broken: 589384 }
      ],
      outputType: 'array',
      expectedOutput: []
    },
    {
      testDescription:
        'Returns empty array when given data with repeating dates',
      inputData: [
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 125,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 126,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 127,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        },
        {
          date: '2021-7-1',
          allUsd: 102201,
          allTxs: 128,
          currencyPairs: {
            'USD-BTC': 79147,
            'EUR-ETH': 1138
          }
        }
      ],
      outputType: 'array',
      expectedOutput: []
    }
  ]
}
