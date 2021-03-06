/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

import * as vscode from 'vscode';
import * as myExtension from '../../src/extension';
import { FabricGatewayRegistry } from '../../src/fabric/FabricGatewayRegistry';
import { FabricRuntimeRegistry } from '../../src/fabric/FabricRuntimeRegistry';
import { FabricRuntimeManager } from '../../src/fabric/FabricRuntimeManager';
import { ExtensionUtil } from '../../src/util/ExtensionUtil';
import { FabricRuntime } from '../../src/fabric/FabricRuntime';
import { VSCodeBlockchainOutputAdapter } from '../../src/logging/VSCodeBlockchainOutputAdapter';
import { BlockchainRuntimeExplorerProvider } from '../../src/explorer/BlockchainRuntimeExplorer';
import { BlockchainTreeItem } from '../../src/explorer/model/BlockchainTreeItem';
import { RuntimeTreeItem } from '../../src/explorer/runtimeOps/RuntimeTreeItem';
import { TestUtil } from '../TestUtil';
import { FabricWallet } from '../../src/fabric/FabricWallet';
import { FabricWalletGenerator } from '../../src/fabric/FabricWalletGenerator';
import * as path from 'path';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { ExtensionCommands } from '../../ExtensionCommands';

chai.should();

// tslint:disable no-unused-expression
describe('startFabricRuntime', () => {

    let sandbox: sinon.SinonSandbox;
    const connectionRegistry: FabricGatewayRegistry = FabricGatewayRegistry.instance();
    const runtimeRegistry: FabricRuntimeRegistry = FabricRuntimeRegistry.instance();
    const runtimeManager: FabricRuntimeManager = FabricRuntimeManager.instance();
    let runtime: FabricRuntime;
    let runtimeTreeItem: RuntimeTreeItem;
    let commandSpy: sinon.SinonSpy;
    const rootPath: string = path.dirname(__dirname);

    before(async () => {
        await TestUtil.setupTests();
        await TestUtil.storeGatewaysConfig();
        await TestUtil.storeRuntimesConfig();
    });

    after(async () => {
        await TestUtil.restoreGatewaysConfig();
        await TestUtil.restoreRuntimesConfig();
    });

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        await ExtensionUtil.activateExtension();
        await connectionRegistry.clear();
        await runtimeRegistry.clear();
        await runtimeManager.clear();
        await runtimeManager.add('local_fabric');
        runtime = runtimeManager.get('local_fabric');
        sandbox.stub(FabricRuntimeManager.instance().get('local_fabric'), 'isRunning').resolves(false);

        sandbox.stub(runtime, 'getConnectionProfile').resolves();
        sandbox.stub(runtime, 'getCertificate').resolves();
        sandbox.stub(runtime, 'getPrivateKey').resolves();
        const testFabricWallet: FabricWallet = new FabricWallet('myConnection', path.join(rootPath, '../../test/data/walletDir/emptyWallet'));
        sandbox.stub(testFabricWallet, 'importIdentity').resolves();
        sandbox.stub(FabricWalletGenerator.instance(), 'createLocalWallet').resolves(testFabricWallet);

        const provider: BlockchainRuntimeExplorerProvider = myExtension.getBlockchainRuntimeExplorerProvider();
        const children: BlockchainTreeItem[] = await provider.getChildren();
        runtimeTreeItem = children.find((child: BlockchainTreeItem) => child instanceof RuntimeTreeItem) as RuntimeTreeItem;
        commandSpy = sandbox.spy(vscode.commands, 'executeCommand');
    });

    afterEach(async () => {
        sandbox.restore();
        await connectionRegistry.clear();
        await runtimeRegistry.clear();
        await runtimeManager.clear();
    });

    it('should start a Fabric runtime specified by clicking the tree', async () => {
        const startStub: sinon.SinonStub = sandbox.stub(runtime, 'start').resolves();
        await vscode.commands.executeCommand(runtimeTreeItem.command.command);
        startStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());
        commandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_LOCAL_OPS);
    });

    it('should start a Fabric runtime', async () => {
        const startStub: sinon.SinonStub = sandbox.stub(runtime, 'start').resolves();
        await vscode.commands.executeCommand(ExtensionCommands.START_FABRIC);
        startStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());
        commandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_LOCAL_OPS);
    });
});
