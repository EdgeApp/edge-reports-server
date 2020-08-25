const fs = require('fs')

const rawTestData = {
  inputOne: [
    {
      orderId:
        '3419c8e89cc33d392fa882ef448cb326f4d5b70de5a54a11ec7c79eb8a11896e',
      depositCurrency: 'DOGE',
      payoutCurrency: 'ETH',
      timestamp: 1594351955.264,
      usdValue: 196.46396120225884
    },
    {
      orderId:
        '6FE128188D16C13DB00ED8962640051B7600E601711C00682006404A996A990C',
      depositCurrency: 'XRP',
      payoutCurrency: 'DOGE',
      timestamp: 1594360209.044,
      usdValue: 21.66977686562629
    },
    {
      orderId:
        'f4df3a562b84dd5edd4b4a5a6ee5ab58c2e95f254425aaaa755ebd08e0525c3d',
      depositCurrency: 'LTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594365026.121,
      usdValue: 43.5332177393634
    },
    {
      orderId:
        '1af0faa3cd3b9378f9bbc1c1887eaf474eb4014474674b04d43e2650799c9aca',
      depositCurrency: 'DOGE',
      payoutCurrency: 'BTC',
      timestamp: 1594370585.275,
      usdValue: 10.426821978854969
    },
    {
      orderId:
        '4ca09502b98f13e1eefefa7ab01e0d76ff8927c9a49080f56873748d02ccce34',
      depositCurrency: 'DOGE',
      payoutCurrency: 'LTC',
      timestamp: 1594376453.252,
      usdValue: 45.354977704482
    },
    {
      orderId:
        '8c75a909b3a181030268143ef96aa782560a2163c7f871ac3aa5cd5c8ffc1a01',
      depositCurrency: 'DOGE',
      payoutCurrency: 'XLM',
      timestamp: 1594377122.011,
      usdValue: 44.90383385400632
    },
    {
      orderId:
        'd5bdb49df65d419edd51886eec7c6c68f217fcff6c10fd617216cf8991af03f2',
      depositCurrency: 'BTC',
      payoutCurrency: 'XRP',
      timestamp: 1594378885.315,
      usdValue: 10.440395218750519
    },
    {
      orderId:
        'ab5947118bd181bb380c32927f7845b0aa8b7f23fe61e49cd9efb168191ea320',
      depositCurrency: 'BTG',
      payoutCurrency: 'DOGE',
      timestamp: 1594382106.471,
      usdValue: 22.22298692136
    },
    {
      orderId:
        '0414ece5c628a15588d0887d22ba9628919445653f867d737489c2e1f9b01f54',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594385326.325,
      usdValue: 18.348062470921604
    },
    {
      orderId:
        'e793a2322dac7a21ad4a720870bf63affc15d2c990f90c2ce621e65c4da6a3f8',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1594386424.006,
      usdValue: 65.7040014549597
    },
    {
      orderId:
        '3c37ab378b4255a68593ce47501c4c81970866ce74ab3366b34ce369e637db40',
      depositCurrency: 'XMR',
      payoutCurrency: 'ETH',
      timestamp: 1594387663.057,
      usdValue: 9.644518858665599
    },
    {
      orderId:
        'bcdaa53bf9e5e95401d233a92307af47dffc58ce9ee0a88293c558e978067ec9',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594389078.328,
      usdValue: 14.731238689262424
    },
    {
      orderId:
        '33f064f193e690d0331ecf2a4b4939c398fb977e94124aea64d026e2058d59a4',
      depositCurrency: 'BTC',
      payoutCurrency: 'POLY',
      timestamp: 1594405072.688,
      usdValue: 29.9791086886794
    },
    {
      orderId:
        '5638c719f28dcf0927bd7d1e10004b3fec809496cb599f440f5a118bbfd04497',
      depositCurrency: 'DOGE',
      payoutCurrency: 'BTC',
      timestamp: 1594411283.738,
      usdValue: 34.07745677701315
    },
    {
      orderId:
        'a9f95d1c16d9d3c3c5c53566cf213928c870b1ec0afeba6c34a85b4fe71617f8',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594413099.317,
      usdValue: 20.97942584678724
    },
    {
      orderId:
        'e3c40f5004de3b91fd9496bafb46c0ea463e0f2f703d2d644ae05dc690d9375c',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594414549.16,
      usdValue: 18.408455507881122
    },
    {
      orderId:
        '4a7e12b98102f032c57dbe7c0c05cba7e1749a6185a7e6cf85f1b3cc3676d770',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594419027.408,
      usdValue: 798.7013064374866
    },
    {
      orderId:
        'EC32FAFD00CE954BFC400948B72F8BA1EACC965B39AD0E6EE5C30C692BFEAD62',
      depositCurrency: 'XRP',
      payoutCurrency: 'BTC',
      timestamp: 1594421263.837,
      usdValue: 12.00385275635792
    },
    {
      orderId:
        '0x41ab2f2cb34c861861d8fba072f440692ddc61bbfc59ae218ec6eac5750edcda',
      depositCurrency: 'KNC',
      payoutCurrency: 'LINK',
      timestamp: 1594428782.069,
      usdValue: 20.011996903143903
    },
    {
      orderId:
        '3e82650529af159f8d786d2487e6c3ec6aa17785de4a9f805b51bdc2f470c53b',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594429126.834,
      usdValue: 498.9184724981584
    },
    {
      orderId:
        'fbd5abab7d531076df94185268f2e2958f76b4224c015022569b37067806c7c1',
      depositCurrency: 'BTC',
      payoutCurrency: 'LINK',
      timestamp: 1594431514.563,
      usdValue: 19.98111695134347
    },
    {
      orderId:
        '285c3dd8fec6d8999e83e723b3c621446fd1b74ceed2d4755287fd0e5e64d0a3',
      depositCurrency: 'XLM',
      payoutCurrency: 'BTC',
      timestamp: 1594435425.54,
      usdValue: 16.94499749667328
    },
    {
      orderId:
        'b74846e127e2d9f529c1c98d9e683d7b59e42c14d927fd2bd89760adf942e089',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594450488.322,
      usdValue: 12.586362898559882
    },
    {
      orderId:
        '65f094f9320ab3966573dc5d7611dbe62c17b30742abecfac1cd7406e48aa005',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594458635.174,
      usdValue: 95.82786761213205
    },
    {
      orderId:
        '3c1ec154721f696d266ab5bb7e73c981d8a5c00b00b2fba93a960546f301aafd',
      depositCurrency: 'DOGE',
      payoutCurrency: 'ETH',
      timestamp: 1594463905.535,
      usdValue: 352.08483601220803
    },
    {
      orderId:
        'cc6fc9a85ffb932394d2818615d74168fd91d45bb626f6215a10447d8ca9b438',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594489595.008,
      usdValue: 486.3643614421758
    },
    {
      orderId:
        '46c509ee2166fe66b9883f6b684a32168d52bda8f127fa0dc7c0a512d37a64fc',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594494316.245,
      usdValue: 750.7866611641095
    },
    {
      orderId:
        '0546d1432f54581c40ee7fd2e3399707dfba70069c6784dcedf0dcd567ebe8b2',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594503380.804,
      usdValue: 92.2321346478
    },
    {
      orderId:
        '33ffd057b5980ee2764d1ce78c0cc50c33955750e86d85fbce06692ca6954ab2',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1594504465.586,
      usdValue: 14.398431827535001
    },
    {
      orderId:
        'ebdd00b70ef02ef816d69f1cd0185a357fe3a662c5320463cf5bf4826c90bce5',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594504728.851,
      usdValue: 656.6228388258666
    },
    {
      orderId:
        'ae4fb48e4eb4b8605f1661507956381b4a051366dfe144a89e423a57031f1ff4',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594511150.899,
      usdValue: 500.39672798275245
    },
    {
      orderId:
        '0de966ce687b32ae4d66d02e30fbdb1d47eae803e475fb635aff01306ef6af59',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1594512135.16,
      usdValue: 15.5891574387234
    },
    {
      orderId:
        '812769c2e395c09b70a4bb77f8ac32102b651a946f60165149046588a892297f',
      depositCurrency: 'BTC',
      payoutCurrency: 'POLY',
      timestamp: 1594517455.593,
      usdValue: 39.951374886016
    },
    {
      orderId:
        '0xab326ead7b53c9a0edb99ff3e4df2d09e7d3094032d575075f8fa50867c39362',
      depositCurrency: 'ETH',
      payoutCurrency: 'XRP',
      timestamp: 1594519414.41,
      usdValue: 40.877767911532324
    },
    {
      orderId:
        '39c21d66dcbcfe1639abb5e4c73359154b3067b74cd8ff735a2905772079781e',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594520476.426,
      usdValue: 98.46224997357027
    },
    {
      orderId:
        'BEDA18518074930057737798D5EA99F4DDEF735D5ECC29198B81B30BAB91911B',
      depositCurrency: 'XRP',
      payoutCurrency: 'BNB',
      timestamp: 1594530279.271,
      usdValue: 19.98968289257178
    },
    {
      orderId:
        '19ea770554ac486fdca1639e4c81ef0057ea5cef527d873edf8fde7782558b51',
      depositCurrency: 'LTC',
      payoutCurrency: 'LINK',
      timestamp: 1594532756.51,
      usdValue: 11.568876263683082
    },
    {
      orderId:
        'E2CBD1306949ECA70AC1B3372A3AFDE8E4A8BD02EB9B3CDB69B76AA753A09744',
      depositCurrency: 'XRP',
      payoutCurrency: 'BTC',
      timestamp: 1594533000.587,
      usdValue: 13.89124576745856
    },
    {
      orderId:
        'b3782044d2c7a40bcc1ecb74c4250608255ab457ba23b14c7f466160cdeaf5d7',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1594535636.687,
      usdValue: 209.4493804932
    },
    {
      orderId:
        '1ba6e8694417d07f018824770a0f1ca343e86dd2b23c024659e05a77b4f5ecd9',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594537684.706,
      usdValue: 48.610335961824376
    },
    {
      orderId:
        'c1f799aebf5aa9a78334ab9689cd3e77dc696fae60019166589a9f7791d45719',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594546114.377,
      usdValue: 11.29194617291837
    },
    {
      orderId:
        '130c937e39d1cc1938129a180de12b01fa3003c8228bfd85d5730e590be65e51',
      depositCurrency: 'DASH',
      payoutCurrency: 'BTC',
      timestamp: 1594559383.207,
      usdValue: 10.116017566466
    },
    {
      orderId:
        '99574007f542d5257a55a5a88e576c38e368c608f556b6aeef7d4edca556a381',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594569052.855,
      usdValue: 37.982361090736966
    },
    {
      orderId:
        'a0655ef18f56465438ca6cebf0fe7ce307a82ad865108b4f1d5f0af5c624a6e4',
      depositCurrency: 'DASH',
      payoutCurrency: 'BTC',
      timestamp: 1594574708.627,
      usdValue: 13.003919171744311
    },
    {
      orderId:
        '67e188118099c32963f7c8eab63c133730a10751d64d4293d33cdb3ea07394d7',
      depositCurrency: 'DASH',
      payoutCurrency: 'BTC',
      timestamp: 1594575636.591,
      usdValue: 14.318561737747622
    },
    {
      orderId:
        '1d9444bc091fe91aeb8591337d700f0f4815399e3f8adc70dafc1fef87f943d1',
      depositCurrency: 'BCHABC',
      payoutCurrency: 'BTC',
      timestamp: 1594580182.03,
      usdValue: 11.285936608903066
    },
    {
      orderId:
        'da69effc35635dec3521ba2e839add784ebc6d4d08b61d4e505a9ebdcd8fa092',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594581611.066,
      usdValue: 20.063861355569852
    },
    {
      orderId:
        '65b5f2bf7c638d034f2f39278d9756d147cade0503d722e977f452126854125d',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594585343.412,
      usdValue: 19.98236735073004
    },
    {
      orderId:
        'c21928a521f8980649ae92f92d93cb0ec67ccc0d351759a236a7ae3b46f4627c',
      depositCurrency: 'XLM',
      payoutCurrency: 'BTC',
      timestamp: 1594593252.559,
      usdValue: 16.9202914346648
    },
    {
      orderId:
        'ca5340babe794a7b782d1bd961fa30cf055032eb8b1c5697435a6da1d777f7f6',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594594290.083,
      usdValue: 193.4788589362198
    },
    {
      orderId:
        'e89820ac2d4fb34c76ae509cc98e27b0d42141369563fe89f5014a74075be452',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1594595181.115,
      usdValue: 13.983917033166751
    },
    {
      orderId:
        '07fd2bea58349802bd8c4b47a2313b010614c755c1efa7ee4c29ba7849a2211c',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594599772.233,
      usdValue: 102.46863461000542
    },
    {
      orderId:
        'a1723214c8025945f86930979d3f2ec87fc676fcce380067aba2527004e4d6db',
      depositCurrency: 'BTC',
      payoutCurrency: 'USDT',
      timestamp: 1594603239.129,
      usdValue: 14.009735807498151
    },
    {
      orderId:
        'cc9b5503bebedb9db1c0f812f9e3db311d61d280942e6a0d9e6aa97ecc47312e',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594604868.802,
      usdValue: 14.95558578548767
    },
    {
      orderId:
        '9d512e0cd4aac7f88592986dc815af65fb5d3957b518aab6d1654cbd874ad1d2',
      depositCurrency: 'BCHABC',
      payoutCurrency: 'BTC',
      timestamp: 1594618063.094,
      usdValue: 20.30120719237915
    },
    {
      orderId:
        '8a7d4a40d368ba8900051d93a1122ee5c36fe84ce0b348023abf1a77ac3dda5b',
      depositCurrency: 'LTC',
      payoutCurrency: 'LINK',
      timestamp: 1594618195.123,
      usdValue: 8.487001185661915
    },
    {
      orderId:
        '8ef811e7ac54f9cc8220b8ff3a8180bb3fd4ff865babdf1c48df0556ec6768a6',
      depositCurrency: 'DOGE',
      payoutCurrency: 'BNT',
      timestamp: 1594630947.633,
      usdValue: 1910.3368198739308
    },
    {
      orderId:
        'fb434652c3fd133db8d40f9b76d34c0c2cb9507db7483274207b842577be0647',
      depositCurrency: 'RVN',
      payoutCurrency: 'BTC',
      timestamp: 1594642920.731,
      usdValue: 31.662063385949903
    },
    {
      orderId:
        '0xed5d06d38717480a839405b4b1e245025786531cc5925751ce76f7a1f114bcc0',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1594647777.236,
      usdValue: 12.934992866991099
    },
    {
      orderId:
        'b3ecdc719e4bb11e89a72768b63b6244adc57683c9060d9baa86e4a5c14a9672',
      depositCurrency: 'BTC',
      payoutCurrency: 'RVN',
      timestamp: 1594650333.927,
      usdValue: 467.8768459578956
    },
    {
      orderId:
        '0x2e7f0516b878c4b5aeaa6786383744cc399836c1add4b4de6d942236d21ef9d2',
      depositCurrency: 'ETH',
      payoutCurrency: 'KNC',
      timestamp: 1594658594.866,
      usdValue: 16.94278417034
    },
    {
      orderId:
        'ddde6bbf5804c3d888291ba278562476cc6b84668e881a8a3ccb3a6f653f0e45',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594659867.337,
      usdValue: 29.88770230910325
    },
    {
      orderId:
        'eccff86d948cfb3f16e74e25727097a91610f9e9b9dd7536e397bc40c0e1cdf0',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594668264.332,
      usdValue: 711.2591323102623
    },
    {
      orderId:
        '0x67cc170bf79b7a9f5b855ba7a327701a3617e985f0251919a390f72849b1c4fc',
      depositCurrency: 'ETH',
      payoutCurrency: 'NEXO',
      timestamp: 1594672529.825,
      usdValue: 24.960156373013852
    },
    {
      orderId:
        '0x3cb99d41b3cf9a656a3f03f2b49f4ef3404319b61d8ddbea00429b959e33ff27',
      depositCurrency: 'ETH',
      payoutCurrency: 'USDC',
      timestamp: 1594672719.085,
      usdValue: 15.948555060926399
    },
    {
      orderId:
        'b4fd81de087894cc1b93a19df3e23aa9b217239b93db9215ca12ed9f13367b5a',
      depositCurrency: 'BTC',
      payoutCurrency: 'XTZ',
      timestamp: 1594675748.038,
      usdValue: 5.810937095833991
    },
    {
      orderId:
        '605be33e9d967debb5fcbdccb3bff32339cdea172ae1c5ceb5316e269acd2789',
      depositCurrency: 'BTC',
      payoutCurrency: 'BCHABC',
      timestamp: 1594699991.177,
      usdValue: 18.99117579815739
    },
    {
      orderId:
        'c05f57d2b19911eaed29060fd421303271e2f2e481747d66ef8f68781d5bf347',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594704572.207,
      usdValue: 546.1785193715548
    },
    {
      orderId:
        '4d73d9a49c044ebd99ed1763d00785acd19dc36612fc460d50cf206663b80693',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1594711082.984,
      usdValue: 10.6652343059077
    },
    {
      orderId:
        '91bb928090c3fbd3c1478175cefd9a65e65088fa92f5621b7de28aa8c72d2bb1',
      depositCurrency: 'BTC',
      payoutCurrency: 'BCHABC',
      timestamp: 1594713960.763,
      usdValue: 19.989795670699518
    },
    {
      orderId:
        '7324219A1B8A49841615F24D0516530B12B494785D76F3AE3D5123C7C9A6B776',
      depositCurrency: 'XRP',
      payoutCurrency: 'LINK',
      timestamp: 1594729087.255,
      usdValue: 12.49527495363045
    },
    {
      orderId:
        'badb1ad2399b8b66189cf85bf3c9acab87d77c9f36c328beb1388dd16dc67e40',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594743406.798,
      usdValue: 50.41493379854204
    },
    {
      orderId:
        'cae2021624796a45849684d066ad8cfe8ce704a3e63956f7971bddd115cba2e1',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594748674.37,
      usdValue: 19.969980681316322
    },
    {
      orderId:
        'a1b9dd49983d54e9dd039b2c47101b9023ab88e896b74fc347ba1cd47c54ec50',
      depositCurrency: 'LTC',
      payoutCurrency: 'LINK',
      timestamp: 1594754702.131,
      usdValue: 5.852682439805498
    },
    {
      orderId:
        '5595238c2c1ebbfc3d18e6d54637b2829e919b0bd76ece4c3fb0433a5dd8a4dc',
      depositCurrency: 'QTUM',
      payoutCurrency: 'USDC',
      timestamp: 1594758093.156,
      usdValue: 31.86745219494
    },
    {
      orderId:
        'cddfbdac4e4b1fa1c2183e879cc076be53778fdd757f67c4d5d6542bd43343a4',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594758543.847,
      usdValue: 43.11702557515427
    },
    {
      orderId:
        '0xc84d0feeaeed3b75cce2c8084ff7a8fdbe24b825cf4b50fc9611bb2aaaca152f',
      depositCurrency: 'NEXO',
      payoutCurrency: 'ETH',
      timestamp: 1594760146.065,
      usdValue: 17.090707570886
    },
    {
      orderId:
        'f044b690e0691d97a5c7fc45207dd90f423cec080875cdd48b386505dcd8caf5',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594760526.304,
      usdValue: 20.970015707505038
    },
    {
      orderId:
        '0x9ea150aab64be7fe9e3cd03d6914498fc32bc092f7d411a250769613df17c30e',
      depositCurrency: 'ETH',
      payoutCurrency: 'XRP',
      timestamp: 1594762268.251,
      usdValue: 17.925853295425842
    },
    {
      orderId:
        '3fa13e2b49ed0044d6901f64029d70fb654d503270ffd18d139e12e72767dbe4',
      depositCurrency: 'DOGE',
      payoutCurrency: 'KNC',
      timestamp: 1594764513.197,
      usdValue: 1140.4183395295383
    },
    {
      orderId:
        '20FFA9CDACB235F5E68F5D2EA2893A8F12E0160EAD7184C0043ABAE708D918D5',
      depositCurrency: 'XRP',
      payoutCurrency: 'BTC',
      timestamp: 1594777101.024,
      usdValue: 29.035510345818
    },
    {
      orderId:
        '285fc017cbdedf7c1d2e245263168d6a7902217fd8576a38bcae6f72fc118f5b',
      depositCurrency: 'BTC',
      payoutCurrency: 'BCHSV',
      timestamp: 1594801561.572,
      usdValue: 19.99069062676944
    },
    {
      orderId:
        '783d65a20c56929e63ff2a0b3d157172527ca691fb09b92104fdbf431b677baf',
      depositCurrency: 'BTC',
      payoutCurrency: 'XRP',
      timestamp: 1594804751.463,
      usdValue: 10.98046119221128
    },
    {
      orderId:
        '0xf7b791b89a28701c5a80901ad0b82d28629000dc88a351464dd752e44e5acad3',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1594812603.367,
      usdValue: 18.087837087605003
    },
    {
      orderId:
        '1847B4F542EDD9297CE88C275EE012839D538603638147EB0F271ECC4E40F160',
      depositCurrency: 'BNB',
      payoutCurrency: 'BTC',
      timestamp: 1594826630.92,
      usdValue: 10.995353672141341
    },
    {
      orderId:
        '1a5b3eb8b60919d9da4b57bee5c8bd13ffbc0a1502258948283e4514cdf372a3',
      depositCurrency: 'BTC',
      payoutCurrency: 'XMR',
      timestamp: 1594827683.236,
      usdValue: 199.860243489863
    },
    {
      orderId:
        'AB651645E43BF6AB7C545F51DEA1264539F07DFAA42E98AF280E1B3C6F7B3F06',
      depositCurrency: 'XRP',
      payoutCurrency: 'BNB',
      timestamp: 1594834653.943,
      usdValue: 39.99157622931422
    },
    {
      orderId:
        '92e4282b85fb3acbce67a616c555a29c1bcda12e1936b191119a8d84f077137c',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594835425.182,
      usdValue: 26.2082011863339
    },
    {
      orderId:
        '6081c48fd7885524bb8c0c16769f06051c341f8ca973b71ed620408928178f3a',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1594836712.462,
      usdValue: 14.08396563524
    },
    {
      orderId:
        '65b9c15ccd958ca631643596bf6c682852e7fb22813d4b1278a22d8f7ff0b302',
      depositCurrency: 'DOGE',
      payoutCurrency: 'BTC',
      timestamp: 1594849066.632,
      usdValue: 28.20511106318007
    },
    {
      orderId:
        '7dd459249073f68a073147c69c64f25bc9c954f2e8f4051f7a244700bcf9ce65',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1594855343.566,
      usdValue: 10.637753746092056
    },
    {
      orderId:
        'e04d1efc127790a9d7012e0f372ea0fd646db279a3d8cbc06ebbd4280453a8c2',
      depositCurrency: 'DOGE',
      payoutCurrency: 'BNB',
      timestamp: 1594883010.931,
      usdValue: 33.850572912556125
    },
    {
      orderId:
        '0x45a8badf0a56953982548f9016393fee8ed73dc47bb021c594f140d33ee1efe3',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1594892908.019,
      usdValue: 10.461721811947472
    },
    {
      orderId:
        '88c4cdb86c100f1a2a0ae22c2151e0c7a7fb46c92de52025897e9dbfe53838dc',
      depositCurrency: 'DOGE',
      payoutCurrency: 'ETH',
      timestamp: 1594895936.307,
      usdValue: 500.9018050066641
    },
    {
      orderId:
        '0x73625efafd824eacc36d2a2f30f3909727b206b796bb99a8921bf6ba5ffd345d',
      depositCurrency: 'ETH',
      payoutCurrency: 'XRP',
      timestamp: 1594900879.615,
      usdValue: 7.00817153739165
    },
    {
      orderId:
        'd0fac67f887653844fdd45a9ae4b3ea788d604902c24f15c01cc9cebd30a1fd5',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1594923577.822,
      usdValue: 98.00723072565475
    },
    {
      orderId:
        '0x399af1d560b2358fa10671c5310aa6ec710ff17919455de157c9061a219c5461',
      depositCurrency: 'USDC',
      payoutCurrency: 'BTC',
      timestamp: 1594928262.073,
      usdValue: 16.905625606155002
    },
    {
      orderId:
        '70e6d09e4ffadb2c2a6d03896db706deb633b8bc3fcfb2e3cea89c85d4d76821',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1594953652.248,
      usdValue: 21.970304070696237
    },
    {
      orderId:
        '0x96d2b331fdaa0ce41098438f249774c084784507f2cbe7991c222a25ff615d47',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1594994797.254,
      usdValue: 10.00054833117816
    },
    {
      orderId:
        '0x43ba47501812be31ea9f0d34ac450fedcf589ec7132743d2fe1a9b0ed174b3ae',
      depositCurrency: 'LINK',
      payoutCurrency: 'BTC',
      timestamp: 1595003694.027,
      usdValue: 24.076808012869684
    },
    {
      orderId:
        'abbf8e4321b2b9cf094e5b42ab91ae5b06b4724367d4f4a56b63f13515564bff',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1595012841.178,
      usdValue: 29.981184716598033
    },
    {
      orderId:
        '17a41140918615a2f7e5b11d4841f66b0833a72aca1a75cd1ea69fdffdaced1e',
      depositCurrency: 'BTC',
      payoutCurrency: 'XTZ',
      timestamp: 1595015795.468,
      usdValue: 4.9858440393387005
    },
    {
      orderId:
        'd00adce3c53b7ca0092d179f3391f7eb2a6a4f28d41f293337c8c465834d03de',
      depositCurrency: 'BTC',
      payoutCurrency: 'RLC',
      timestamp: 1595029745.629,
      usdValue: 1557.0567474297727
    },
    {
      orderId:
        '90999120ddd0f419b33df5ffc813285bb41302f2819a6bd2cc3388a15a6712b6',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1595032057.769,
      usdValue: 25.03888548112332
    },
    {
      orderId:
        '8cc310d3b04adec3c61dad1b4fe998bd6d42527fdd1160071d930b4240c60a08',
      depositCurrency: 'BTC',
      payoutCurrency: 'BCHABC',
      timestamp: 1595034938.182,
      usdValue: 17.95742743165296
    },
    {
      orderId:
        '34020b98312b4df86b3ddc05b96bdb887716d726fb04557070dfe160c99636b7',
      depositCurrency: 'BTC',
      payoutCurrency: 'LTC',
      timestamp: 1595036365.163,
      usdValue: 12.47257290457866
    },
    {
      orderId:
        '9baff6d3a11e808a1127033d51edf3b600ceb52cc89538e7d00877f6c6366f94',
      depositCurrency: 'BTC',
      payoutCurrency: 'XLM',
      timestamp: 1595039235.309,
      usdValue: 18.3772993296189
    },
    {
      orderId:
        '5042f30925d653e8be25c3237df708bbd8bdd6402d0162a0c4b0d1929bb91ef7',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1595040913.873,
      usdValue: 24.9334860420936
    },
    {
      orderId:
        'd5b435214766835c1441631e0d90d773648ba19620bb31be25c74fd71834124e',
      depositCurrency: 'BTC',
      payoutCurrency: 'XRP',
      timestamp: 1595042011.717,
      usdValue: 25.60653105341864
    },
    {
      orderId:
        '0x37c41e232e6fa53b72a46b49dc09a54785b2c6ba73739dbe74d19ea42ed51b7f',
      depositCurrency: 'LINK',
      payoutCurrency: 'ETH',
      timestamp: 1595044346.696,
      usdValue: 12.874597110302178
    },
    {
      orderId:
        '0x319f9ee1db6b76c45d71ccc495a931c173f613f2e053f28975ac46535c34537b',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1595045029.144,
      usdValue: 25.959902365959
    },
    {
      orderId:
        '0x0bbd96aca6d69bd57e91cc81ea1ec591d1721e43a394ef8f7b9e35d73210772a',
      depositCurrency: 'ETH',
      payoutCurrency: 'XRP',
      timestamp: 1595049093.781,
      usdValue: 18.533707347172946
    },
    {
      orderId:
        '750fe7314389ab64dd5ee43053cffaad6309d715ae6a25c19090738e8c760cfb',
      depositCurrency: 'LTC',
      payoutCurrency: 'USDT',
      timestamp: 1595065475.568,
      usdValue: 1059.38865431
    },
    {
      orderId:
        'd6310d5f7550ce0ea06e75ad82649dede3fccc2b3dae90b315edf7828c614888',
      depositCurrency: 'DOGE',
      payoutCurrency: 'LINK',
      timestamp: 1595067223.053,
      usdValue: 856.3218184399308
    },
    {
      orderId:
        'a408c58cc937c7376e402ad4d6f5cb1a752fe87bb53d1075e944a8dd2008a1db',
      depositCurrency: 'XMR',
      payoutCurrency: 'RLC',
      timestamp: 1595081056.356,
      usdValue: 623.7357083808093
    },
    {
      orderId:
        '21ab36f94e0af71339632213e197c73000953fb1ff3a727a8c877ca708437ccd',
      depositCurrency: 'XMR',
      payoutCurrency: 'RLC',
      timestamp: 1595081056.406,
      usdValue: 623.7357083808093
    },
    {
      orderId:
        '0x2d34cfea2120f2a09d775179f6adf9c5b57bad4ac3a5b9c680aa4f498616e7f7',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1595099027.571,
      usdValue: 12.96349789943436
    },
    {
      orderId:
        '3B21477EA0634D4B80AFE26D8B80C0B5E1A0B7319747D741490EC3B51CA67EB8',
      depositCurrency: 'BNB',
      payoutCurrency: 'BTC',
      timestamp: 1595103759.766,
      usdValue: 15.948281098364639
    },
    {
      orderId:
        '650914e7890a548f3b372abe826b0d6ca83d69de52353fe9335e383ad77f2e62',
      depositCurrency: 'XMR',
      payoutCurrency: 'ETH',
      timestamp: 1595117205.643,
      usdValue: 99.73054920904818
    },
    {
      orderId:
        '0x77648e858b21b40717fc42447f1cca79f9d2366dd98822dc19091eebf3c49292',
      depositCurrency: 'USDT',
      payoutCurrency: 'LTC',
      timestamp: 1595125539.186,
      usdValue: 78.0674312127036
    },
    {
      orderId:
        '12849caa0b37c694a48cc74c1f54d47fd63e8ba436a37b610f85b00a62b64f09',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1595130323.256,
      usdValue: 10.832809782712001
    },
    {
      orderId:
        'd9b01ea8f3cdfb9f4a9560b85c0c54d513a7cec0710a1169a352b6c963bd5224',
      depositCurrency: 'RVN',
      payoutCurrency: 'ETH',
      timestamp: 1595170071.146,
      usdValue: 9.939616607489949
    },
    {
      orderId:
        '0xd6d249d03de22cb1b205b1254f3d9c1de13f825e23a9ab46dd2bbab0db4c3569',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1595173505.835,
      usdValue: 18.936277802721
    },
    {
      orderId:
        '31D7BFF4ABC500450EA2B9EAEDC0665B157FBB2913C395E028992D38BC249CD2',
      depositCurrency: 'XRP',
      payoutCurrency: 'BTC',
      timestamp: 1595187790.814,
      usdValue: 27.9460185935328
    },
    {
      orderId:
        '0x1d596eb440a81001f514d49725965e1a953879adf626f69abc25be55816e65be',
      depositCurrency: 'ETH',
      payoutCurrency: 'LTC',
      timestamp: 1595201314.526,
      usdValue: 8.98013736347532
    },
    {
      orderId:
        '3dcc4cb1c89b12cce05b4298c193edc49cd330dcd9bdc2221f43391c72db9dd4',
      depositCurrency: 'BTC',
      payoutCurrency: 'BCHABC',
      timestamp: 1595211950.911,
      usdValue: 19.9209409518528
    },
    {
      orderId:
        'b034e08f7dbeb39cadbf7c10593c4feeb75ca17c63efa3d0d1ef95394878663c',
      depositCurrency: 'BTC',
      payoutCurrency: 'DAI',
      timestamp: 1595247652.648,
      usdValue: 6.980823176180841
    },
    {
      orderId:
        '620d8e31b37e1681d8373ff621b64371b8d789d181d77af08a8a93f7353dc378',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1595255232.981,
      usdValue: 170.82371932658185
    },
    {
      orderId:
        '75927c236e86e29f71de421269bd6a0e28022b09559a984cb7f56796cd24a20d',
      depositCurrency: 'LTC',
      payoutCurrency: 'BNB',
      timestamp: 1595260806.268,
      usdValue: 9.289118872836
    },
    {
      orderId:
        '2de1aa85ef21729a2db85052f1ebcb552071e69e9ff2116bf19b9b6f809106fa',
      depositCurrency: 'BCHABC',
      payoutCurrency: 'XRP',
      timestamp: 1595261058.924,
      usdValue: 21.98388230543158
    },
    {
      orderId:
        '215145b64bbceca14d9c9aec80bd1875163703ff18907e0782d024e87c3ef0a0',
      depositCurrency: 'BTC',
      payoutCurrency: 'USDT',
      timestamp: 1595268848.261,
      usdValue: 144.54094513989486
    },
    {
      orderId:
        '1dfb3c2813b74317fe97768f2d2d7a7bdccfa574e37eb5806f317a7ccc308bd7',
      depositCurrency: 'DASH',
      payoutCurrency: 'BTC',
      timestamp: 1595270404.556,
      usdValue: 12.83657223870132
    },
    {
      orderId:
        '45c927300b3eff9d4f1374ad80b664fc8d507c26d20eb1d9347715c158a45f3e',
      depositCurrency: 'DOGE',
      payoutCurrency: 'BNB',
      timestamp: 1595271599.452,
      usdValue: 17.78248418380489
    },
    {
      orderId:
        '00631113e1e9391b138efd012a2f270cbb53bc0f13311e2ef0fa838c38dfd093',
      depositCurrency: 'LTC',
      payoutCurrency: 'BTC',
      timestamp: 1595276940.584,
      usdValue: 11.89942196010588
    },
    {
      orderId:
        '5aeae49d69a67432f2753be958c8e0c28642eb857c0f98f6ffc966aa404fe58b',
      depositCurrency: 'DOGE',
      payoutCurrency: 'POLY',
      timestamp: 1595282245.407,
      usdValue: 48.7970166379449
    },
    {
      orderId:
        'B5935B008024837E785E2A585B375571F02B72E8FE5510F28652257E56666AC5',
      depositCurrency: 'XRP',
      payoutCurrency: 'BTC',
      timestamp: 1595283216.255,
      usdValue: 25.0562268876936
    },
    {
      orderId:
        'B2843B191664AE76B38F7646EAA4421A8F12D08F494FBE5A579DA26CF32F7A6B',
      depositCurrency: 'XRP',
      payoutCurrency: 'BTC',
      timestamp: 1595283922.527,
      usdValue: 14.0017537094391
    },
    {
      orderId:
        'c82f3fe6f45d4274696237954dc7748df1e127d24433820b01833abcdf5cc6d1',
      depositCurrency: 'LTC',
      payoutCurrency: 'ETH',
      timestamp: 1595286833.551,
      usdValue: 19.95136564068622
    },
    {
      orderId:
        '58410939441E9686469DA507CE5B14B1F4DF6FAF049E46FE87A204C8E8DC6B54',
      depositCurrency: 'XRP',
      payoutCurrency: 'DOGE',
      timestamp: 1595294486.384,
      usdValue: 174.5475785744688
    },
    {
      orderId:
        'f906bd59a7fbac114a9c47f2fa853eb040e32410a305684f6753ef07518d2be0',
      depositCurrency: 'BTC',
      payoutCurrency: 'USDT',
      timestamp: 1595303025.829,
      usdValue: 29.92858328266598
    },
    {
      orderId:
        '0xbf2f4676c036b66507216eb87c331d6b7043f627a328c62197ee31e829a76a90',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1595306466.072,
      usdValue: 23.676044416400003
    },
    {
      orderId:
        '9be15d85277ac8e938dc4bb7d22fcfe5f295c0eea358afa3eb6a13b8e6b5b469',
      depositCurrency: 'BTC',
      payoutCurrency: 'BCHABC',
      timestamp: 1595324935.287,
      usdValue: 12.656728498290661
    },
    {
      orderId:
        '49e50bc10bfb66bb5ad8b3303c90ee60bb4a675503a2420e39b7ec882e9ba4c9',
      depositCurrency: 'BCHABC',
      payoutCurrency: 'BTC',
      timestamp: 1595325025.343,
      usdValue: 16.304990702109087
    },
    {
      orderId:
        '0x1c35030e6db6fc4003a75da78202b5b9bd37bcfc07057655598a1179acda5a83',
      depositCurrency: 'OMG',
      payoutCurrency: 'USDC',
      timestamp: 1595332252.449,
      usdValue: 12.773739338099999
    },
    {
      orderId:
        '0xe4c1ca44a07fa2414f0a13e33de243cc805799497662557d848f63c3584c6412',
      depositCurrency: 'REP',
      payoutCurrency: 'USDC',
      timestamp: 1595332306.058,
      usdValue: 12.708161563047
    },
    {
      orderId:
        '7d83e943997575278caae2dd9cffa5643cbbc26e57a06eac898118f4a3b8af03',
      depositCurrency: 'DOGE',
      payoutCurrency: 'ETH',
      timestamp: 1595333295.46,
      usdValue: 31.005526944710972
    },
    {
      orderId:
        '5bfa8cabee7ebefb31ab86723ac9f079630de6f54cb4a1df86a3aa5952a7361f',
      depositCurrency: 'BTC',
      payoutCurrency: 'BNB',
      timestamp: 1595348210.188,
      usdValue: 25.43308459171968
    },
    {
      orderId:
        'bd6110623eab79b8475366e2889fe1c5f9e39f24667c1c2988ff9c5d8bc0a78c',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1595349645.927,
      usdValue: 12.589076805512558
    },
    {
      orderId:
        '544B6F15D5F61D19D1ED4A27AAFA379EDBA1F9EA018F0F34C1FDCEC916C5C239',
      depositCurrency: 'XRP',
      payoutCurrency: 'LINK',
      timestamp: 1595366881.427,
      usdValue: 14.88034540312879
    },
    {
      orderId:
        '0xc99c1c3b447938fae4c4c7449d5d9ef9846668a95c6bb6d031436a0b99bed3bc',
      depositCurrency: 'ETH',
      payoutCurrency: 'BNB',
      timestamp: 1595373797.696,
      usdValue: 20.464990813564608
    },
    {
      orderId:
        '2873a8093a181b659f10b659d2f75f0ea9ed92043cf6f29e9852b27361c32610',
      depositCurrency: 'BTC',
      payoutCurrency: 'LINK',
      timestamp: 1595373890.954,
      usdValue: 21.660871075988066
    },
    {
      orderId:
        '5a991f1cfc1f13550a460b25596643b2b4f6b99fb6a4d39c59705d25659f658a',
      depositCurrency: 'BTC',
      payoutCurrency: 'KNC',
      timestamp: 1595374142.091,
      usdValue: 21.64377570279221
    },
    {
      orderId:
        '47089b32036d4f075f34e75bb025c35d640ebd1e8ea0553a6491048b39462329',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1595377067.109,
      usdValue: 27.64192237134322
    },
    {
      orderId:
        'b3f0beb4e5bcd08b904c14b745f508bd2cf01a3def1eaf51d769fc2cb118dd77',
      depositCurrency: 'BTC',
      payoutCurrency: 'QTUM',
      timestamp: 1595380108.183,
      usdValue: 27.002485708648823
    },
    {
      orderId:
        'ca2be1ece45bbcef6144f11ba219e1fce748606b877e9014c5322319b4ff6523',
      depositCurrency: 'XLM',
      payoutCurrency: 'BTC',
      timestamp: 1595382103.848,
      usdValue: 12.72564224412385
    },
    {
      orderId:
        '0x762dd0b44d62d0efd52bc556c3555a64c931c91a980e32e52a0cbb67ecaecce6',
      depositCurrency: 'USDT',
      payoutCurrency: 'BTC',
      timestamp: 1595384256.064,
      usdValue: 220.38109889549284
    },
    {
      orderId:
        'aae9a2cd979b7262ed01e96930404374fdf32f100b60850ad6f19ca20f350a56',
      depositCurrency: 'XMR',
      payoutCurrency: 'BTC',
      timestamp: 1595385207.983,
      usdValue: 19.999403156960785
    },
    {
      orderId:
        '0x3c3361c0cb7adcb5b23f1ab14299c6962f7222e730be21143187180c2b58d84f',
      depositCurrency: 'BNT',
      payoutCurrency: 'ZRX',
      timestamp: 1595395147.869,
      usdValue: 11.531170463535823
    },
    {
      orderId:
        '0x0def065895c7230e3a335ca44cd902b86c77530219d711efb14fd27ab4b74ed0',
      depositCurrency: 'ZRX',
      payoutCurrency: 'XRP',
      timestamp: 1595396388.849,
      usdValue: 10.083336806508179
    },
    {
      orderId:
        '0x81404dd3b93ef323eb90f721bfde0e13742aafc0cb7e9aec4bcb4981fecf5543',
      depositCurrency: 'ETH',
      payoutCurrency: 'DOGE',
      timestamp: 1595405246.465,
      usdValue: 10.462782712939573
    },
    {
      orderId:
        '0x6a92837e862adee78adb71962daee6e10a67f425681c38f54c20c4bc973d3e3c',
      depositCurrency: 'ETH',
      payoutCurrency: 'BNB',
      timestamp: 1595415827.041,
      usdValue: 12.199309533841582
    },
    {
      orderId:
        'e88a32fab02cdbe4edf3766ddc9ef66d5c3ad6cbfc693dab9064203a8ce0d91e',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1595429269.912,
      usdValue: 10.995629535638782
    },
    {
      orderId:
        '0xae09889f56418b60e99f05dd08a6b77cd654575fcccb7811be0e1ce46128c20c',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1595434613.85,
      usdValue: 14.98816645542584
    },
    {
      orderId:
        '0x42c1fb5df5a061a46a20c75abdd0c4a058451896c47a548c04b0ac06e3befeee',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1595436760.045,
      usdValue: 12.74012557224883
    },
    {
      orderId:
        '7d8e408dc76cb648c091ca9aba678c35ce37f45452107e6d89b4e0d449533ada',
      depositCurrency: 'XMR',
      payoutCurrency: 'ETH',
      timestamp: 1595454302.778,
      usdValue: 114.04515841630094
    }
  ],
  outputOne: {
    result: {
      month: [
        {
          start: 1593561600,
          isoDate: '2020-07-01T00:00:00.000Z',
          usdValue: 18949.855647399967,
          numTxs: 165,
          currencyCodes: {
            DOGE: 4353.434238976961,
            ETH: 1039.0955238959054,
            XRP: 284.4744748234416,
            LTC: 657.4227287986909,
            BTC: 5201.818782682226,
            XLM: 54.93603217954358,
            BTG: 11.11149346068,
            XMR: 2447.688590691915,
            POLY: 59.363750106320154,
            KNC: 599.5084481529072,
            LINK: 504.1056943697439,
            BNB: 102.97222740035744,
            DASH: 25.13753535732963,
            BCHABC: 79.6960425797381,
            USDT: 773.1582243241278,
            BNT: 960.9339951687333,
            RVN: 254.73926297566774,
            NEXO: 21.025431971949928,
            USDC: 45.1017668815842,
            XTZ: 5.398390567586346,
            QTUM: 29.43496895179441,
            BCHSV: 9.99534531338472,
            RLC: 1402.2640820956956,
            DAI: 3.4904115880904203,
            OMG: 6.386869669049999,
            REP: 6.3540807815235,
            ZRX: 10.807253635022
          },
          currencyPairs: {
            'DOGE-ETH': 1080.456129165842,
            'XRP-DOGE': 196.21735544009508,
            'LTC-DOGE': 43.5332177393634,
            'DOGE-BTC': 72.70938981904818,
            'DOGE-LTC': 45.354977704482,
            'DOGE-XLM': 44.90383385400632,
            'BTC-XRP': 47.02738746438044,
            'BTG-DOGE': 22.22298692136,
            'BTC-DOGE': 3183.5007530190783,
            'XMR-BTC': 399.55013057290876,
            'XMR-ETH': 223.42022648401473,
            'BTC-POLY': 69.9304835746954,
            'BTC-ETH': 359.4050744830546,
            'XRP-BTC': 121.93460806029998,
            'KNC-LINK': 20.011996903143903,
            'BTC-LINK': 41.641988027331536,
            'XLM-BTC': 46.59093117546193,
            'BTC-XMR': 3024.935407565288,
            'ETH-XRP': 84.34550009152277,
            'XRP-BNB': 59.981259121886,
            'LTC-LINK': 25.908559889150496,
            'DASH-BTC': 50.27507071465926,
            'BCHABC-BTC': 47.892134503391304,
            'BTC-USDT': 188.479264230059,
            'DOGE-BNT': 1910.3368198739308,
            'RVN-BTC': 31.662063385949903,
            'ETH-BTC': 160.74911460991078,
            'BTC-RVN': 467.8768459578956,
            'ETH-KNC': 16.94278417034,
            'ETH-NEXO': 24.960156373013852,
            'ETH-USDC': 15.948555060926399,
            'BTC-XTZ': 10.796781135172692,
            'BTC-BCHABC': 89.51606835065333,
            'XRP-LINK': 27.37562035675924,
            'QTUM-USDC': 31.86745219494,
            'NEXO-ETH': 17.090707570886,
            'DOGE-KNC': 1140.4183395295383,
            'BTC-BCHSV': 19.99069062676944,
            'BNB-BTC': 26.94363477050598,
            'DOGE-BNB': 51.633057096361014,
            'USDC-BTC': 16.905625606155002,
            'LINK-BTC': 24.076808012869684,
            'BTC-RLC': 1557.0567474297727,
            'BTC-LTC': 12.47257290457866,
            'BTC-XLM': 18.3772993296189,
            'LINK-ETH': 12.874597110302178,
            'LTC-USDT': 1059.38865431,
            'DOGE-LINK': 856.3218184399308,
            'XMR-RLC': 1247.4714167616187,
            'USDT-LTC': 78.0674312127036,
            'RVN-ETH': 9.939616607489949,
            'ETH-LTC': 8.98013736347532,
            'BTC-DAI': 6.980823176180841,
            'LTC-BNB': 9.289118872836,
            'BCHABC-XRP': 21.98388230543158,
            'LTC-BTC': 11.89942196010588,
            'DOGE-POLY': 48.7970166379449,
            'LTC-ETH': 19.95136564068622,
            'OMG-USDC': 12.773739338099999,
            'REP-USDC': 12.708161563047,
            'BTC-BNB': 25.43308459171968,
            'ETH-BNB': 32.66430034740619,
            'BTC-KNC': 21.64377570279221,
            'BTC-QTUM': 27.002485708648823,
            'USDT-BTC': 220.38109889549284,
            'BNT-ZRX': 11.531170463535823,
            'ZRX-XRP': 10.083336806508179,
            'ETH-DOGE': 10.462782712939573
          }
        }
      ],
      day: [],
      hour: [],
      numAllTxs: 165
    },
    app: 'edge',
    pluginId: 'coinswitch',
    start: 1594023608,
    end: 1596055300
  },
  inputTwo: [
    {
      orderId: '3419c',
      depositCurrency: 'DOGE',
      payoutCurrency: 'ETH',
      timestamp: 1300000500,
      usdValue: 400
    },
    {
      orderId: '6FE12',
      depositCurrency: 'XRP',
      payoutCurrency: 'DOGE',
      timestamp: 1300001000,
      usdValue: 80
    },
    {
      orderId: 'f4df3',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1300002500,
      usdValue: 2000
    },
    {
      orderId: 'f4ut3',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1300012500,
      usdValue: 7000
    },
    {
      orderId: 'uuu98',
      depositCurrency: 'ETH',
      payoutCurrency: 'DOGE',
      timestamp: 1300069000,
      usdValue: 40
    }
  ],
  outputTwo: {
    result: {
      month: [
        {
          start: 1298937600,
          isoDate: '2011-03-01T00:00:00.000Z',
          usdValue: 9520,
          numTxs: 5,
          currencyCodes: { DOGE: 4760, ETH: 220, XRP: 40, BTC: 4500 },
          currencyPairs: {
            'DOGE-ETH': 400,
            'XRP-DOGE': 80,
            'BTC-DOGE': 9000,
            'ETH-DOGE': 40
          }
        }
      ],
      day: [
        {
          start: 1299974400,
          isoDate: '2011-03-13T00:00:00.000Z',
          usdValue: 9480,
          numTxs: 4,
          currencyCodes: { DOGE: 4740, ETH: 200, XRP: 40, BTC: 4500 },
          currencyPairs: { 'DOGE-ETH': 400, 'XRP-DOGE': 80, 'BTC-DOGE': 9000 }
        },
        {
          start: 1300060800,
          isoDate: '2011-03-14T00:00:00.000Z',
          usdValue: 40,
          numTxs: 1,
          currencyCodes: { ETH: 20, DOGE: 20 },
          currencyPairs: { 'ETH-DOGE': 40 }
        }
      ],
      hour: [
        {
          start: 1299999600,
          isoDate: '2011-03-13T07:00:00.000Z',
          usdValue: 2480,
          numTxs: 3,
          currencyCodes: { DOGE: 1240, ETH: 200, XRP: 40, BTC: 1000 },
          currencyPairs: { 'DOGE-ETH': 400, 'XRP-DOGE': 80, 'BTC-DOGE': 2000 }
        },
        {
          start: 1300003200,
          isoDate: '2011-03-13T08:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300006800,
          isoDate: '2011-03-13T09:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300010400,
          isoDate: '2011-03-13T10:00:00.000Z',
          usdValue: 7000,
          numTxs: 1,
          currencyCodes: { BTC: 3500, DOGE: 3500 },
          currencyPairs: { 'BTC-DOGE': 7000 }
        },
        {
          start: 1300014000,
          isoDate: '2011-03-13T11:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300017600,
          isoDate: '2011-03-13T12:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300021200,
          isoDate: '2011-03-13T13:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300024800,
          isoDate: '2011-03-13T14:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300028400,
          isoDate: '2011-03-13T15:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300032000,
          isoDate: '2011-03-13T16:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300035600,
          isoDate: '2011-03-13T17:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300039200,
          isoDate: '2011-03-13T18:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300042800,
          isoDate: '2011-03-13T19:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300046400,
          isoDate: '2011-03-13T20:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300050000,
          isoDate: '2011-03-13T21:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300053600,
          isoDate: '2011-03-13T22:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300057200,
          isoDate: '2011-03-13T23:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300060800,
          isoDate: '2011-03-14T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300064400,
          isoDate: '2011-03-14T01:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1300068000,
          isoDate: '2011-03-14T02:00:00.000Z',
          usdValue: 40,
          numTxs: 1,
          currencyCodes: { ETH: 20, DOGE: 20 },
          currencyPairs: { 'ETH-DOGE': 40 }
        }
      ],
      numAllTxs: 5
    },
    app: 'app-dummy',
    pluginId: 'partner-dummy',
    start: 1300000000,
    end: 1300070000
  },
  inputThree: [
    {
      orderId: '5758h',
      depositCurrency: 'BTC',
      payoutCurrency: 'ETH',
      timestamp: 1709001000,
      usdValue: 9900.43
    },
    {
      orderId: '8lert',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1709200000,
      usdValue: 800
    },
    {
      orderId: 'qppow',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1709200200,
      usdValue: 20000
    },
    {
      orderId: 'vnwrg',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1709270000,
      usdValue: 2
    },
    {
      orderId: 'pq00x',
      depositCurrency: 'ETH',
      payoutCurrency: 'DOGE',
      timestamp: 1709420000,
      usdValue: 1000
    }
  ],
  outputThree: {
    result: {
      month: [],
      day: [
        {
          start: 1708992000,
          isoDate: '2024-02-27T00:00:00.000Z',
          usdValue: 9900.43,
          numTxs: 1,
          currencyCodes: { BTC: 4950.215, ETH: 4950.215 },
          currencyPairs: { 'BTC-ETH': 9900.43 }
        },
        {
          start: 1709078400,
          isoDate: '2024-02-28T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709164800,
          isoDate: '2024-02-29T00:00:00.000Z',
          usdValue: 20800,
          numTxs: 2,
          currencyCodes: { BTC: 10400, DOGE: 10400 },
          currencyPairs: { 'BTC-DOGE': 20800 }
        },
        {
          start: 1709251200,
          isoDate: '2024-03-01T00:00:00.000Z',
          usdValue: 2,
          numTxs: 1,
          currencyCodes: { BTC: 1, DOGE: 1 },
          currencyPairs: { 'BTC-DOGE': 2 }
        },
        {
          start: 1709337600,
          isoDate: '2024-03-02T00:00:00.000Z',
          usdValue: 1000,
          numTxs: 1,
          currencyCodes: { ETH: 500, DOGE: 500 },
          currencyPairs: { 'ETH-DOGE': 1000 }
        },
        {
          start: 1709424000,
          isoDate: '2024-03-03T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        }
      ],
      hour: [
        {
          start: 1708992000,
          isoDate: '2024-02-27T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1708995600,
          isoDate: '2024-02-27T01:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1708999200,
          isoDate: '2024-02-27T02:00:00.000Z',
          usdValue: 9900.43,
          numTxs: 1,
          currencyCodes: { BTC: 4950.215, ETH: 4950.215 },
          currencyPairs: { 'BTC-ETH': 9900.43 }
        },
        {
          start: 1709002800,
          isoDate: '2024-02-27T03:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709006400,
          isoDate: '2024-02-27T04:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709010000,
          isoDate: '2024-02-27T05:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709013600,
          isoDate: '2024-02-27T06:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709017200,
          isoDate: '2024-02-27T07:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709020800,
          isoDate: '2024-02-27T08:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709024400,
          isoDate: '2024-02-27T09:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709028000,
          isoDate: '2024-02-27T10:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709031600,
          isoDate: '2024-02-27T11:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709035200,
          isoDate: '2024-02-27T12:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709038800,
          isoDate: '2024-02-27T13:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709042400,
          isoDate: '2024-02-27T14:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709046000,
          isoDate: '2024-02-27T15:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709049600,
          isoDate: '2024-02-27T16:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709053200,
          isoDate: '2024-02-27T17:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709056800,
          isoDate: '2024-02-27T18:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709060400,
          isoDate: '2024-02-27T19:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709064000,
          isoDate: '2024-02-27T20:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709067600,
          isoDate: '2024-02-27T21:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709071200,
          isoDate: '2024-02-27T22:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709074800,
          isoDate: '2024-02-27T23:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709078400,
          isoDate: '2024-02-28T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709082000,
          isoDate: '2024-02-28T01:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709085600,
          isoDate: '2024-02-28T02:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709089200,
          isoDate: '2024-02-28T03:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709092800,
          isoDate: '2024-02-28T04:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709096400,
          isoDate: '2024-02-28T05:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709100000,
          isoDate: '2024-02-28T06:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709103600,
          isoDate: '2024-02-28T07:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709107200,
          isoDate: '2024-02-28T08:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709110800,
          isoDate: '2024-02-28T09:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709114400,
          isoDate: '2024-02-28T10:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709118000,
          isoDate: '2024-02-28T11:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709121600,
          isoDate: '2024-02-28T12:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709125200,
          isoDate: '2024-02-28T13:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709128800,
          isoDate: '2024-02-28T14:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709132400,
          isoDate: '2024-02-28T15:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709136000,
          isoDate: '2024-02-28T16:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709139600,
          isoDate: '2024-02-28T17:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709143200,
          isoDate: '2024-02-28T18:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709146800,
          isoDate: '2024-02-28T19:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709150400,
          isoDate: '2024-02-28T20:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709154000,
          isoDate: '2024-02-28T21:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709157600,
          isoDate: '2024-02-28T22:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709161200,
          isoDate: '2024-02-28T23:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709164800,
          isoDate: '2024-02-29T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709168400,
          isoDate: '2024-02-29T01:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709172000,
          isoDate: '2024-02-29T02:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709175600,
          isoDate: '2024-02-29T03:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709179200,
          isoDate: '2024-02-29T04:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709182800,
          isoDate: '2024-02-29T05:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709186400,
          isoDate: '2024-02-29T06:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709190000,
          isoDate: '2024-02-29T07:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709193600,
          isoDate: '2024-02-29T08:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709197200,
          isoDate: '2024-02-29T09:00:00.000Z',
          usdValue: 20800,
          numTxs: 2,
          currencyCodes: { BTC: 10400, DOGE: 10400 },
          currencyPairs: { 'BTC-DOGE': 20800 }
        },
        {
          start: 1709200800,
          isoDate: '2024-02-29T10:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709204400,
          isoDate: '2024-02-29T11:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709208000,
          isoDate: '2024-02-29T12:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709211600,
          isoDate: '2024-02-29T13:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709215200,
          isoDate: '2024-02-29T14:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709218800,
          isoDate: '2024-02-29T15:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709222400,
          isoDate: '2024-02-29T16:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709226000,
          isoDate: '2024-02-29T17:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709229600,
          isoDate: '2024-02-29T18:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709233200,
          isoDate: '2024-02-29T19:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709236800,
          isoDate: '2024-02-29T20:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709240400,
          isoDate: '2024-02-29T21:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709244000,
          isoDate: '2024-02-29T22:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709247600,
          isoDate: '2024-02-29T23:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709251200,
          isoDate: '2024-03-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709254800,
          isoDate: '2024-03-01T01:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709258400,
          isoDate: '2024-03-01T02:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709262000,
          isoDate: '2024-03-01T03:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709265600,
          isoDate: '2024-03-01T04:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709269200,
          isoDate: '2024-03-01T05:00:00.000Z',
          usdValue: 2,
          numTxs: 1,
          currencyCodes: { BTC: 1, DOGE: 1 },
          currencyPairs: { 'BTC-DOGE': 2 }
        },
        {
          start: 1709272800,
          isoDate: '2024-03-01T06:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709276400,
          isoDate: '2024-03-01T07:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709280000,
          isoDate: '2024-03-01T08:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709283600,
          isoDate: '2024-03-01T09:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709287200,
          isoDate: '2024-03-01T10:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709290800,
          isoDate: '2024-03-01T11:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709294400,
          isoDate: '2024-03-01T12:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709298000,
          isoDate: '2024-03-01T13:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709301600,
          isoDate: '2024-03-01T14:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709305200,
          isoDate: '2024-03-01T15:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709308800,
          isoDate: '2024-03-01T16:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709312400,
          isoDate: '2024-03-01T17:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709316000,
          isoDate: '2024-03-01T18:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709319600,
          isoDate: '2024-03-01T19:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709323200,
          isoDate: '2024-03-01T20:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709326800,
          isoDate: '2024-03-01T21:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709330400,
          isoDate: '2024-03-01T22:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709334000,
          isoDate: '2024-03-01T23:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709337600,
          isoDate: '2024-03-02T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709341200,
          isoDate: '2024-03-02T01:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709344800,
          isoDate: '2024-03-02T02:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709348400,
          isoDate: '2024-03-02T03:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709352000,
          isoDate: '2024-03-02T04:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709355600,
          isoDate: '2024-03-02T05:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709359200,
          isoDate: '2024-03-02T06:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709362800,
          isoDate: '2024-03-02T07:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709366400,
          isoDate: '2024-03-02T08:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709370000,
          isoDate: '2024-03-02T09:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709373600,
          isoDate: '2024-03-02T10:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709377200,
          isoDate: '2024-03-02T11:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709380800,
          isoDate: '2024-03-02T12:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709384400,
          isoDate: '2024-03-02T13:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709388000,
          isoDate: '2024-03-02T14:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709391600,
          isoDate: '2024-03-02T15:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709395200,
          isoDate: '2024-03-02T16:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709398800,
          isoDate: '2024-03-02T17:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709402400,
          isoDate: '2024-03-02T18:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709406000,
          isoDate: '2024-03-02T19:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709409600,
          isoDate: '2024-03-02T20:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709413200,
          isoDate: '2024-03-02T21:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709416800,
          isoDate: '2024-03-02T22:00:00.000Z',
          usdValue: 1000,
          numTxs: 1,
          currencyCodes: { ETH: 500, DOGE: 500 },
          currencyPairs: { 'ETH-DOGE': 1000 }
        },
        {
          start: 1709420400,
          isoDate: '2024-03-02T23:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1709424000,
          isoDate: '2024-03-03T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        }
      ],
      numAllTxs: 5
    },
    app: 'app-dummy',
    pluginId: 'partner-dummy',
    start: 1708992000,
    end: 1709424000
  },
  inputFour: [
    {
      orderId: '8hhhc',
      depositCurrency: 'ETH',
      payoutCurrency: 'BTC',
      timestamp: 1672444902,
      usdValue: 920
    },
    {
      orderId: 'lrgna',
      depositCurrency: 'BTC',
      payoutCurrency: 'DOGE',
      timestamp: 1706518400,
      usdValue: 3
    }
  ],
  outputFour: {
    result: {
      month: [
        {
          start: 1669852800,
          isoDate: '2022-12-01T00:00:00.000Z',
          usdValue: 920,
          numTxs: 1,
          currencyCodes: { ETH: 460, BTC: 460 },
          currencyPairs: { 'ETH-BTC': 920 }
        },
        {
          start: 1672531200,
          isoDate: '2023-01-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1675209600,
          isoDate: '2023-02-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1677628800,
          isoDate: '2023-03-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1680307200,
          isoDate: '2023-04-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1682899200,
          isoDate: '2023-05-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1685577600,
          isoDate: '2023-06-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1688169600,
          isoDate: '2023-07-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1690848000,
          isoDate: '2023-08-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1693526400,
          isoDate: '2023-09-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1696118400,
          isoDate: '2023-10-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1698796800,
          isoDate: '2023-11-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1701388800,
          isoDate: '2023-12-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        },
        {
          start: 1704067200,
          isoDate: '2024-01-01T00:00:00.000Z',
          usdValue: 3,
          numTxs: 1,
          currencyCodes: { BTC: 1.5, DOGE: 1.5 },
          currencyPairs: { 'BTC-DOGE': 3 }
        },
        {
          start: 1706745600,
          isoDate: '2024-02-01T00:00:00.000Z',
          usdValue: 0,
          numTxs: 0,
          currencyCodes: {},
          currencyPairs: {}
        }
      ],
      day: [],
      hour: [],
      numAllTxs: 2
    },
    app: 'app-dummy',
    pluginId: 'partner-dummy',
    start: 1672444800,
    end: 1706918400
  }
}

// cd into test directory
// $ node makeTestData.js
console.log('Writing file')
fs.writeFile('./testData.json', JSON.stringify(rawTestData, null, 2), err => {
  if (err) throw err
  console.log('File written successfully.')
})
