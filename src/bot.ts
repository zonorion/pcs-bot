import { Injectable, OnModuleInit } from '@nestjs/common'
import * as ethers from 'ethers'
import * as chalk from 'chalk'
import { TOKEN_SNIPERS } from './config'

enum CRYPTO_TYPE {
    BNB,
    BUSD,
}

@Injectable()
export class Bot implements OnModuleInit {
    private config = {
        WBNB: process.env.WBNB_CONTRACT, // wbnb

        BUSD: process.env.BUSD_CONTRACT, // wbnb

        TO_PURCHASE_ADDRESS: process.env.TO_PURCHASE, // token that you will purchase = BUSD for test '0xe9e7cea3dedca5984780bafc599bd69add087d56'

        AMOUNT_OF_WBNB: process.env.AMOUNT_OF_WBNB, // how much you want to buy in WBNB

        factory: process.env.FACTORY, // PancakeSwap V2 factory

        router: process.env.ROUTER, // PancakeSwap V2 router

        recipient: process.env.MY_ADDRESS, // your wallet address,

        slippage: process.env.SLIPPAGE, // in Percentage

        MIN_LIQUIDITY_ADDED: process.env.MIN_LIQUIDITY_ADDED, // min liquidity added

        MAX_LIQUIDITY_ADDED: process.env.MAX_LIQUIDITY_ADDED, // max liquidity added

        MIN_FIXED_BNB_LIQUIDITY_ADDED: process.env.MIN_FIXED_BNB_LIQUIDITY_ADDED, // min fixed liquidity added

        MIN_FIXED_BUSD_LIQUIDITY_ADDED: process.env.MIN_FIXED_BUSD_LIQUIDITY_ADDED, // min fixed liquidity added

        WSS_NODE: process.env.WSS_NODE,

        RPC_NODE: process.env.RPC_NODE,

        MY_MNEMONIC: process.env.MY_MNEMONIC,

        MIN_BALANCE: process.env.MIN_BALANCE,
    }

    private tokensAlreadyToBuy = []
    private canBuy = true
    private balanceAvailable = true
    private isFixedToken = true

    private provider
    private wallet
    private account
    private factory
    private router
    private wbnb
    private busd

    async init() {
        try {
            // this.provider = new ethers.providers.JsonRpcProvider(this.config.RPC_NODE)
            this.provider = new ethers.providers.WebSocketProvider(this.config.WSS_NODE)
            this.wallet = ethers.Wallet.fromMnemonic(this.config.MY_MNEMONIC)
            this.account = this.wallet.connect(this.provider)

            this.factory = new ethers.Contract(
                this.config.factory,
                [
                    'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
                    'function getPair(address tokenA, address tokenB) external view returns (address pair)',
                ],
                this.account,
            )

            this.router = new ethers.Contract(
                this.config.router,
                [
                    'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
                    // eslint-disable-next-line max-len
                    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
                    // eslint-disable-next-line max-len
                    'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
                    'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)',
                    'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)',
                ],
                this.account,
            )

            this.wbnb = new ethers.Contract(
                this.config.WBNB,
                [
                    'function approve(address spender, uint amount) public returns(bool)',
                    'function balanceOf(address account) external view returns (uint256)',
                ],
                this.account,
            )

            this.busd = new ethers.Contract(
                this.config.BUSD,
                [
                    'function approve(address spender, uint amount) public returns(bool)',
                    'function balanceOf(address account) external view returns (uint256)',
                ],
                this.account,
            )
        } catch (err) {
            console.log(`----Init func err: ${err}`)
        }
    }

    async onModuleInit(): Promise<any> {
        await this.init()
        console.log('------Bot Running------')
        // await this.checkLiquid()
        // await Promise.all([
        //     this.approved(),
            // this.approvedBusd(),
        // ])
        // const address = await this.account.getAddress()
        // const balance = await this.wbnb.balanceOf(address.toString())
        // const balanceValue = ethers.utils.formatEther(balance)

        // if (balanceValue <= this.config.MIN_BALANCE) {
        //     this.balanceAvailable = false
        // }

        if (this.balanceAvailable) {
            if (this.isFixedToken) {
                for (const [k, v] of Object.entries(TOKEN_SNIPERS)) {
                    await this.checkLiquid(k, v)
                }
            } else {
                this.factory.on('PairCreated', async (token0, token1, pairAddress) => {
                    const tokenAddress = token0.toUpperCase() === this.config.WBNB.toUpperCase() ? token1 : token0
                    console.log(`
                        New pair detected
                        =================
                        tokenAddress: ${tokenAddress}
                        pairAddress: ${pairAddress}`
                    )
                    
                    const pairBNBValue = await this.wbnb.balanceOf(pairAddress)
                    const fmValue: any = ethers.utils.formatEther(pairBNBValue)
                    console.log(`${chalk.cyan(`---Liquidity pool value : ${fmValue}---`)}`)
                    if (fmValue * 1 >= parseInt(this.config.MIN_LIQUIDITY_ADDED, 10)
                        && fmValue * 1 <= parseInt(this.config.MAX_LIQUIDITY_ADDED, 10)) {
                        console.log(`Is ready to buy: ${this.canBuy}`)
                        if (this.canBuy) {
                            // buy once time
                            this.canBuy = false
                            setTimeout(() => this.buy(this.config.WBNB, tokenAddress, this.config.AMOUNT_OF_WBNB), 1)
                        }
                    } else {
                        console.log(`${chalk.yellow(`Next pair >>>>>>>>>>>>>>>>>>>>>`)}`)
                    }
                })
            }
        } else {
            console.log(`${chalk.red(`.............Your balance not available to buy.............`)}`)
        }
    }

    async buy(tokenAddress, amount, type) {
        try {
            if (this.tokensAlreadyToBuy.includes(tokenAddress)) {
                console.log(chalk.green(`Token buy already in progress.............`))
                return
            }
            this.tokensAlreadyToBuy.push(tokenAddress)

            let tokenIn
            if (type === CRYPTO_TYPE.BNB) {
                tokenIn = this.config.WBNB
            } else {
                tokenIn = this.config.BUSD
            }
            console.log(`----Ready to buy----`)
            let amountOutMin = 0
            // We buy x amount of the new token for our wbnb
            const amountIn: any = ethers.utils.parseUnits(`${amount}`, 'ether')
            if (parseInt(this.config.slippage, 10) !== 0) {
                const amounts = await this.router.getAmountsOut(amountIn, [tokenIn, tokenAddress])
                // Our execution price will be a bit different, we need some flexbility
                amountOutMin = amounts[1].sub(amounts[1].div(`${this.config.slippage}`))
            }

            console.log(
                `${chalk.green(`Start to buy \n`)}
                Buying Token=================
                tokenIn: ${(amountIn * 1e-18).toString()} ${tokenIn}
                tokenOut: ${amountOutMin.toString()} ${tokenAddress}`,
            )

            console.log('Processing Transaction.....')
            console.log(chalk.green(`amountIn: ${(amountIn * 1e-18).toString()} ${tokenIn}`))
            console.log(chalk.green(`amountOutMin: ${amountOutMin}`))
            console.log(chalk.green(`tokenIn: ${tokenIn}`))
            console.log(chalk.green(`tokenOut: ${tokenAddress}`))
            console.log(chalk.green(`your wallet: ${this.config.recipient}`))

            // eslint-disable-next-line max-len
            // const tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens( //uncomment this if you want to buy deflationary token
            const tx = await this.router.swapExactETHForTokens( // uncomment here if you want to buy token
                0,
                [tokenIn, tokenAddress],
                this.config.recipient,
                Date.now() + 1000 * 60 * 10, // 10 minutes
                {
                    gasLimit: process.env.GAS_LIMIT,
                    gasPrice: ethers.utils.parseUnits(process.env.GWEI, 'gwei'),
                },
            )

            const receipt = await tx.wait()
            console.log(`---Transaction receipt---`)
            console.log(`https://www.bscscan.com/tx/${receipt.transactionHash}`)
        } catch (err) {
            console.log(`----Buy error: ${err}----`)
        }
    }

    async approved() {
        const tx = await this.wbnb.approve(
            this.router.address,
            ethers.constants.MaxUint256,
        )

        const receipt = await tx.wait()
        console.log('---Approve transaction receipt---')
        console.log(`https://www.bscscan.com/tx/${receipt.transactionHash}`)
    }

    async approvedBusd() {
        const tx = await this.busd.approve(
            this.router.address,
            ethers.constants.MaxUint256,
            {
                gasLimit: 100000,
            },
        )

        const receipt = await tx.wait()
        console.log('---Approve transaction receipt---')
        console.log(`https://www.bscscan.com/tx/${receipt.transactionHash}`)
    }

    async checkLiquid(tokenOut, amount) {
        try {
            console.log(chalk.yellowBright(`Token snip: ${tokenOut}`))
            const [pairBNBAddress, pairBUSDAdress] = await Promise.all([
                this.factory.getPair(this.config.WBNB, tokenOut),
                this.factory.getPair(this.config.BUSD, tokenOut),
            ])

            console.log(chalk.green(`Pair bnb: ${pairBNBAddress}`))
            console.log(chalk.green(`Pair busd: ${pairBUSDAdress}`))

            if (pairBNBAddress) {
                setTimeout(() => this.processPairAddress(tokenOut, pairBNBAddress, amount, CRYPTO_TYPE.BNB), 1)
            } else if (pairBUSDAdress) {
                setTimeout(() => this.processPairAddress(tokenOut, pairBUSDAdress, amount, CRYPTO_TYPE.BUSD), 1)
            }
        } catch (err) {
            console.log(err)
        }
    }

    async processPairAddress(tokenOut, pairAddress, amount, type) {
        try {
            if (pairAddress.toString().indexOf('0x0000000000000') > -1) {
                console.log(chalk.red(`---PairAddress ${pairAddress} not detected. Auto restart---`))
                setTimeout(() => this.checkLiquid(tokenOut, amount), 100)
            } else {
                let wallet, minLiquid, amountValue
                if (type === CRYPTO_TYPE.BNB) {
                    wallet = this.wbnb
                    minLiquid = this.config.MIN_FIXED_BNB_LIQUIDITY_ADDED
                    amountValue = amount.BNB
                } else {
                    wallet = this.busd
                    minLiquid = this.config.MIN_FIXED_BUSD_LIQUIDITY_ADDED
                    amountValue = amount.BUSD
                }
                const liquidValue = await wallet.balanceOf(pairAddress)
                const liquidValueF: any = ethers.utils.formatEther(liquidValue)
                console.log(chalk.bold(chalk.red(`Pair Value: ${liquidValueF}`)))

                if (liquidValueF * 1 > parseInt(minLiquid, 10)) {
                    if (type === CRYPTO_TYPE.BNB) {
                        setTimeout(() => this.buy(tokenOut, amountValue, type), 1)
                    } else {
                        setTimeout(() => this.buy(tokenOut, amountValue, type), 1)
                    }
                } else {
                    setTimeout(() => this.checkLiquid(tokenOut, amount), 100)
                }
            }
        } catch (e) {
            console.log(e)
        }
    }
}
