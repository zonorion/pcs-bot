import { Injectable, OnModuleInit } from '@nestjs/common'
import * as ethers from 'ethers'
import * as chalk from 'chalk'
import fs from 'fs'

@Injectable()
export class Bot implements OnModuleInit {
    private config = {
        WBNB: process.env.WBNB_CONTRACT, // wbnb

        TO_PURCHASE_ADDRESS: process.env.TO_PURCHASE, // token that you will purchase = BUSD for test '0xe9e7cea3dedca5984780bafc599bd69add087d56'

        AMOUNT_OF_WBNB: process.env.AMOUNT_OF_WBNB, // how much you want to buy in WBNB

        factory: process.env.FACTORY, // PancakeSwap V2 factory

        router: process.env.ROUTER, // PancakeSwap V2 router

        recipient: process.env.MY_ADDRESS, // your wallet address,

        slippage: process.env.SLIPPAGE, // in Percentage

        MIN_LIQUIDITY_ADDED: process.env.MIN_LIQUIDITY_ADDED, // min liquidity added

        MAX_LIQUIDITY_ADDED: process.env.MAX_LIQUIDITY_ADDED, // max liquidity added

        WSS_NODE: process.env.WSS_NODE,

        RPC_NODE: process.env.RPC_NODE,

        MY_MNEMONIC: process.env.MY_MNEMONIC,

        MIN_BALANCE: process.env.MIN_BALANCE,
    }

    private initialLiquidityDetected = false
    private canBuy = true
    private jmlBnb = ''
    private balanceAvailable = true
    private isFixedToken = true

    private tokenIn = this.config.WBNB
    private tokenOut = this.config.TO_PURCHASE_ADDRESS

    private provider
    private wallet
    private account
    private factory
    private router
    private wbnb

    async init() {
        try {
            this.provider = new ethers.providers.JsonRpcProvider(this.config.RPC_NODE)
            // this.provider = new ethers.providers.WebSocketProvider(this.config.WSS_NODE)
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
                    // eslint-disable-next-line max-len
                    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
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
        } catch (err) {
            console.log(`----Init func err: ${err}`)
        }
    }

    async onModuleInit(): Promise<any> {
        await this.init()
        console.log('------Bot Running------')
        // await this.checkLiquid()
        await this.approved()
        const address = await this.account.getAddress()
        const balance = await this.wbnb.balanceOf(address.toString())
        const balanceValue = ethers.utils.formatEther(balance)
        if (balanceValue <= this.config.MIN_BALANCE) {
            this.balanceAvailable = false
        }

        this.factory.on('PairCreated', async (token0, token1, pairAddress) => {
            const tokenAddress = token0.toUpperCase() === this.config.WBNB.toUpperCase() ? token1 : token0
            console.log(`
            New pair detected
            =================
            tokenAddress: ${tokenAddress}
            pairAddress: ${pairAddress}
          `)
            if (this.balanceAvailable) {
                if (this.isFixedToken) {
                    if (tokenAddress.toUpperCase() === this.config.TO_PURCHASE_ADDRESS.toUpperCase()) {
                        console.log(`Token need to purchase: ${this.config.TO_PURCHASE_ADDRESS}`)
                        setTimeout(() => this.buyAction(), 1)
                    }
                } else {
                    const pairBNBValue = await this.wbnb.balanceOf(pairAddress)
                    const fmValue: any = ethers.utils.formatEther(pairBNBValue)
                    console.log(`${chalk.cyan(`---Liquidity pool value : ${fmValue}---`)}`)
                    if (fmValue * 1 >= parseInt(this.config.MIN_LIQUIDITY_ADDED, 10)
                        && fmValue * 1 <= parseInt(this.config.MAX_LIQUIDITY_ADDED, 10)) {
                        console.log(`Is ready to buy: ${this.canBuy}`)
                        if (this.canBuy) {
                            // buy once time
                            this.canBuy = false
                            console.log(`Balance available: ${balanceValue}`)
                            setTimeout(() => this.buy(tokenAddress), 1)
                        }
                    } else {
                        console.log(`${chalk.yellow(`Next pair >>>>>>>>>>>>>>>>>>>>>`)}`)
                    }
                }
            }
        })
    }

    async buy(tokenAddress) {
        try {
            console.log(`----Ready to buy----`)

            let amountOutMin = 0
            // We buy x amount of the new token for our wbnb
            const amountIn: any = ethers.utils.parseUnits(`${this.config.AMOUNT_OF_WBNB}`, 'ether')
            if (parseInt(this.config.slippage, 10) !== 0) {
                const amounts = await this.router.getAmountsOut(amountIn, [this.tokenIn, tokenAddress])
                // Our execution price will be a bit different, we need some flexbility
                amountOutMin = amounts[1].sub(amounts[1].div(`${this.config.slippage}`))
            }

            console.log(
                `${chalk.green(`Start to buy \n`)}
                Buying Token=================
                tokenIn: ${(amountIn * 1e-18).toString()} ${this.tokenIn} (BNB)
                tokenOut: ${amountOutMin.toString()} ${tokenAddress}
              `,
            )

            console.log('Processing Transaction.....')
            console.log(chalk.green(`amountIn: ${(amountIn * 1e-18).toString()} ${this.tokenIn} (BNB)`))
            console.log(chalk.green(`amountOutMin: ${amountOutMin}`))
            console.log(chalk.green(`tokenIn: ${this.tokenIn}`))
            console.log(chalk.green(`tokenOut: ${tokenAddress}`))
            console.log(chalk.green(`your wallet: ${this.config.recipient}`))

            // eslint-disable-next-line max-len
            // const tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens( //uncomment this if you want to buy deflationary token
            const tx = await this.router.swapExactTokensForTokens( // uncomment here if you want to buy token
                amountIn,
                amountOutMin,
                [this.tokenIn, tokenAddress],
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
            fs.appendFile('token_bought.txt', `${tokenAddress}\n`, 'utf8',
                // callback function
                (err) => {
                    if (err) throw err
                    // if no error
                    console.log('Token is appended to file successfully.')
                })
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

    async checkLiquid() {
        try {
            const pairAddress = await this.factory.getPair(this.tokenIn, this.tokenOut)
            console.log(chalk.blue(`---PairAddress: ${pairAddress}---`))
            if (pairAddress !== null && pairAddress !== undefined) {
                if (pairAddress.toString().indexOf('0x0000000000000') > -1) {
                    console.log(chalk.cyan(`---PairAddress ${pairAddress} not detected. Auto restart---`))
                    await this.checkLiquid()
                }
            }
            const pairBNBValue = await this.wbnb.balanceOf(pairAddress)
            this.jmlBnb = ethers.utils.formatEther(pairBNBValue)
            console.log(`---Value BNB : ${this.jmlBnb}---`)

            if (this.jmlBnb > this.config.MIN_LIQUIDITY_ADDED) {
                setTimeout(() => this.buyAction(), 10)
            } else {
                this.initialLiquidityDetected = false
                console.log('---Run again---')
                await this.checkLiquid()
            }
        } catch (err) {
            console.log(err)
        }
    }

    async buyAction() {
        console.log(`${chalk.green(`---Ready to buy---`)}`)
        try {
            let amountOutMin = 0
            // We buy x amount of the new token for our wbnb
            const amountIn: any = ethers.utils.parseUnits(`${this.config.AMOUNT_OF_WBNB}`, 'ether')
            if (parseInt(this.config.slippage, 10) !== 0) {
                const amounts = await this.router.getAmountsOut(amountIn, [this.tokenIn, this.tokenOut])
                // Our execution price will be a bit different, we need some flexbility
                amountOutMin = amounts[1].sub(amounts[1].div(`${this.config.slippage}`))
            }

            console.log(
                `${chalk.green(`Start to buy \n`)}
                Buying Token=================
                tokenIn: ${(amountIn * 1e-18).toString()} ${this.tokenIn} (BNB)
                tokenOut: ${amountOutMin.toString()} ${this.tokenOut}
              `,
            )

            console.log('Processing Transaction.....')
            console.log(chalk.yellow(`amountIn: ${(amountIn * 1e-18)} ${this.tokenIn} (BNB)`))
            console.log(chalk.yellow(`amountOutMin: ${amountOutMin}`))
            console.log(chalk.yellow(`tokenIn: ${this.tokenIn}`))
            console.log(chalk.yellow(`tokenOut: ${this.tokenOut}`))
            console.log(chalk.yellow(`your wallet: ${this.config.recipient}`))

            // const tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens( //uncomment this if you want to buy deflationary token
            const tx = await this.router.swapExactTokensForTokens( // uncomment here if you want to buy token
                amountIn,
                amountOutMin,
                [this.tokenIn, this.tokenOut],
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
            setTimeout(() => { process.exit() }, 2000)
        } catch (err) {
            console.log(err)
        }
    }
}
