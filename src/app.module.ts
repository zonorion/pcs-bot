import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Bot } from './bot'

@Module({
    imports: [ConfigModule.forRoot({ envFilePath: ['.env'] })],
    controllers: [],
    providers: [Bot],
})
export class AppModule {}
