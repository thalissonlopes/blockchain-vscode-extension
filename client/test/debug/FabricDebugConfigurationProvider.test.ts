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
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { FabricDebugConfigurationProvider } from '../../src/debug/FabricDebugConfigurationProvider';
import { FabricRuntime } from '../../src/fabric/FabricRuntime';
import { FabricRuntimeManager } from '../../src/fabric/FabricRuntimeManager';
import { VSCodeBlockchainOutputAdapter } from '../../src/logging/VSCodeBlockchainOutputAdapter';
import { PackageRegistryEntry } from '../../src/packages/PackageRegistryEntry';
import { FabricRuntimeConnection } from '../../src/fabric/FabricRuntimeConnection';
import { FabricGatewayRegistryEntry } from '../../src/fabric/FabricGatewayRegistryEntry';
import { FabricGatewayRegistry } from '../../src/fabric/FabricGatewayRegistry';
import { FabricConnectionManager } from '../../src/fabric/FabricConnectionManager';
import { LogType } from '../../src/logging/OutputAdapter';
import { ExtensionUtil } from '../../src/util/ExtensionUtil';
import { ExtensionCommands } from '../../ExtensionCommands';
import * as dateFormat from 'dateformat';

const should: Chai.Should = chai.should();
chai.use(sinonChai);

// tslint:disable no-unused-expression
describe('FabricDebugConfigurationProvider', () => {

    describe('resolveDebugConfiguration', () => {

        let mySandbox: sinon.SinonSandbox;
        let clock: sinon.SinonFakeTimers;
        let fabricDebugConfig: FabricDebugConfigurationProvider;
        let workspaceFolder: any;
        let debugConfig: any;
        let runtimeStub: sinon.SinonStubbedInstance<FabricRuntime>;
        let findFilesStub: sinon.SinonStub;
        let commandStub: sinon.SinonStub;
        let packageEntry: PackageRegistryEntry;
        let mockRuntimeConnection: sinon.SinonStubbedInstance<FabricRuntimeConnection>;
        let readFileStub: sinon.SinonStub;
        let readJsonStub: sinon.SinonStub;
        let registryEntry: FabricGatewayRegistryEntry;
        let getConnectionStub: sinon.SinonStub;
        let date: Date;
        let formattedDate: string;

        beforeEach(() => {
            mySandbox = sinon.createSandbox();
            clock = sinon.useFakeTimers({ toFake: ['Date'] });
            date = new Date();
            formattedDate = dateFormat(date, 'yyyymmddHHMM');
            fabricDebugConfig = new FabricDebugConfigurationProvider();

            runtimeStub = sinon.createStubInstance(FabricRuntime);
            runtimeStub.getName.returns('localfabric');
            runtimeStub.getConnectionProfile.resolves({ peers: [{ name: 'peer1' }] });
            runtimeStub.getChaincodeAddress.resolves('127.0.0.1:54321');
            runtimeStub.isRunning.resolves(true);
            runtimeStub.isDevelopmentMode.returns(true);

            registryEntry = new FabricGatewayRegistryEntry();
            registryEntry.name = 'local_fabric';
            registryEntry.connectionProfilePath = 'myPath';
            registryEntry.managedRuntime = true;

            mySandbox.stub(FabricRuntimeManager.instance(), 'get').returns(runtimeStub);
            mySandbox.stub(FabricGatewayRegistry.instance(), 'get').returns(registryEntry);

            workspaceFolder = {
                name: 'myFolder',
                uri: vscode.Uri.file('myPath')
            };

            readJsonStub = mySandbox.stub(fs, 'readJSON');
            readFileStub = mySandbox.stub(fs, 'readFile').resolves(`{
                "name": "mySmartContract",
                "version": "0.0.1"
            }`);

            debugConfig = {
                type: 'fabric:node',
                name: 'Launch Program'
            };

            debugConfig.request = 'myLaunch';
            debugConfig.program = 'myProgram';
            debugConfig.cwd = 'myCwd';
            debugConfig.args = ['start', '--peer.address', 'localhost:12345'];

            findFilesStub = mySandbox.stub(vscode.workspace, 'findFiles').resolves([]);

            commandStub = mySandbox.stub(vscode.commands, 'executeCommand');

            packageEntry = new PackageRegistryEntry();
            packageEntry.name = 'banana';
            packageEntry.version = 'vscode-13232112018';
            packageEntry.path = path.join('myPath');
            commandStub.withArgs(ExtensionCommands.PACKAGE_SMART_CONTRACT, sinon.match.any, sinon.match.any).resolves(packageEntry);
            commandStub.withArgs(ExtensionCommands.INSTALL_SMART_CONTRACT, null, sinon.match.any).resolves({
                name: 'test-package@0.0.1',
                path: 'some/path',
                version: '0.0.1'
            });
            commandStub.withArgs('blockchainExplorer.connectEntry', sinon.match.any);

            mockRuntimeConnection = sinon.createStubInstance(FabricRuntimeConnection);
            mockRuntimeConnection.connect.resolves();
            mockRuntimeConnection.getAllPeerNames.resolves('peerOne');

            getConnectionStub = mySandbox.stub(FabricConnectionManager.instance(), 'getConnection').returns(mockRuntimeConnection);
        });

        afterEach(() => {
            clock.restore();
            mySandbox.restore();
        });

        it('should create a debug configuration', async () => {

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345']
            });
        });

        it('should add start arg if not in there', async () => {

            debugConfig.args = ['--peer.address', 'localhost:12345'];

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['--peer.address', 'localhost:12345', 'start']
            });
        });

        it('should set program if not set', async () => {

            debugConfig.program = null;

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: path.join(path.sep, 'myPath', 'node_modules', '.bin', 'fabric-chaincode-node'),
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345']
            });
        });

        it('should add cwd if not set', async () => {

            debugConfig.cwd = null;

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: path.sep + 'myPath',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345']
            });
        });

        it('should add in env properties if not defined', async () => {
            debugConfig.env = null;

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345']
            });
        });

        it('should add CORE_CHAINCODE_ID_NAME to an existing env', async () => {
            debugConfig.env = { myProperty: 'myValue' };

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}`, myProperty: 'myValue' },
                args: ['start', '--peer.address', 'localhost:12345']
            });
        });

        it('should use CORE_CHAINCODE_ID_NAME if defined', async () => {
            debugConfig.env = { CORE_CHAINCODE_ID_NAME: 'myContract:myVersion' };

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: 'myContract:myVersion' },
                args: ['start', '--peer.address', 'localhost:12345']
            });
        });

        it('should add args if not defined', async () => {
            debugConfig.args = null;

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', '127.0.0.1:54321']
            });
        });

        it('should add more args if some args exist', async () => {
            debugConfig.args = ['--myArgs', 'myValue'];

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['--myArgs', 'myValue', 'start', '--peer.address', '127.0.0.1:54321']
            });
        });

        it('should add in request if not defined', async () => {
            debugConfig.request = null;

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            config.should.deep.equal({
                type: 'node2',
                request: 'launch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345']
            });
        });

        it('should give an error if runtime isnt running', async () => {
            runtimeStub.isRunning.returns(false);

            const logSpy: sinon.SinonSpy = mySandbox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            should.not.exist(config);

            logSpy.should.have.been.calledWith(LogType.ERROR, 'Please ensure "local_fabric" is running before trying to debug a smart contract');
        });

        it('should give an error if runtime isn\'t in development mode', async () => {
            runtimeStub.isDevelopmentMode.returns(false);

            const logSpy: sinon.SinonSpy = mySandbox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            should.not.exist(config);

            logSpy.should.have.been.calledWith(LogType.ERROR, `Please ensure "local_fabric" is in development mode before trying to debug a smart contract`);
        });

        it('should handle errors with packaging', async () => {
            commandStub.withArgs(ExtensionCommands.PACKAGE_SMART_CONTRACT, sinon.match.any, sinon.match.any).resolves();

            const logSpy: sinon.SinonSpy = mySandbox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.not.exist(config);

            logSpy.should.not.have.been.called;
        });

        it('should handle errors with installing', async () => {
            commandStub.withArgs(ExtensionCommands.INSTALL_SMART_CONTRACT, sinon.match.any, sinon.match.any, sinon.match.any).resolves();

            const logSpy: sinon.SinonSpy = mySandbox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.not.exist(config);

            logSpy.should.not.have.been.called;
        });

        it('should handle connecting failing', async () => {
            getConnectionStub.returns(undefined);

            const logSpy: sinon.SinonSpy = mySandbox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.not.exist(config);

            logSpy.should.not.have.been.called;
        });

        it('should handle errors with installing', async () => {
            commandStub.withArgs(ExtensionCommands.PACKAGE_SMART_CONTRACT, sinon.match.any, sinon.match.any).rejects({message: 'some error'});

            const logSpy: sinon.SinonSpy = mySandbox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.not.exist(config);

            logSpy.should.have.been.calledWith(LogType.ERROR, 'Failed to launch debug: some error');
        });

        it('should debug typescript', async () => {
            findFilesStub.resolves([vscode.Uri.file('tsconfig.ts')]);

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345'],
                outFiles: [path.join(workspaceFolder.uri.fsPath, '**/*.js')]
            });
        });

        it('should debug JavaScript contract which has TypeScript tests', async () => {
            const loadJsonSpy: sinon.SinonSpy = mySandbox.spy(ExtensionUtil, 'loadJSON');

            findFilesStub.resolves([]);
            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}`},
                args: ['start', '--peer.address', 'localhost:12345']
            });

            loadJsonSpy.should.not.have.been.calledWith(workspaceFolder, 'tsconfig.json');
        });

        it('should use the tsconfig for the configuration', async () => {

            findFilesStub.resolves([vscode.Uri.file('tsconfig.ts')]);

            const fakeConfig: object = {
                compilerOptions: {
                    outDir: 'dist'
                }
            };

            readJsonStub.resolves(fakeConfig);

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345'],
                outFiles: [path.join(workspaceFolder.uri.fsPath, 'dist', '**/*.js')],
                preLaunchTask: 'tsc: build - tsconfig.json'
            });
        });

        it('should not update the directory if it is an absolute path', async () => {

            findFilesStub.resolves([vscode.Uri.file('tsconfig.ts')]);

            const fakeConfig: object = {
                compilerOptions: {
                    outDir: path.join(__dirname, 'mypath')
                }
            };

            readJsonStub.resolves(fakeConfig);

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345'],
                outFiles: [path.join(workspaceFolder.uri.fsPath, '**/*.js')],
                preLaunchTask: 'tsc: build - tsconfig.json'
            });
        });

        it('should update path if not absolute path', async () => {

            findFilesStub.resolves([vscode.Uri.file('tsconfig.ts')]);

            const fakeConfig: object = {
                compilerOptions: {
                    outDir: './dist'
                }
            };

            readJsonStub.resolves(fakeConfig);

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345'],
                outFiles: [path.join(workspaceFolder.uri.fsPath, 'dist', '**/*.js')],
                preLaunchTask: 'tsc: build - tsconfig.json'
            });
        });

        it('should add to outfile if already set', async () => {

            findFilesStub.resolves([vscode.Uri.file('tsconfig.ts')]);

            debugConfig.outFiles = ['cake'];

            const fakeConfig: object = {
                compilerOptions: {
                    outDir: 'dist'
                }
            };

            readJsonStub.resolves(fakeConfig);

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            config.should.deep.equal({
                type: 'node2',
                request: 'myLaunch',
                name: 'Launch Program',
                program: 'myProgram',
                cwd: 'myCwd',
                env: { CORE_CHAINCODE_ID_NAME: `mySmartContract:vscode-debug-${formattedDate}` },
                args: ['start', '--peer.address', 'localhost:12345'],
                outFiles: ['cake', path.join(workspaceFolder.uri.fsPath, 'dist', '**/*.js')],
                preLaunchTask: 'tsc: build - tsconfig.json'
            });
        });

        it('should handle error from reading config file', async () => {
            findFilesStub.resolves([vscode.Uri.file('tsconfig.ts')]);

            const error: Error = new Error('Error reading package.json from project some error');
            readJsonStub.rejects(error);

            const logSpy: sinon.SinonSpy = mySandbox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);

            should.not.exist(config);
            logSpy.should.have.been.calledWith(LogType.ERROR, `Failed to launch debug: ${error.message}`);
        });
    });

    describe('dispose', () => {
        it('should dispose the config', () => {
            const fabricDebugConfig: FabricDebugConfigurationProvider = new FabricDebugConfigurationProvider();
            try {
                fabricDebugConfig.dispose();
            } catch (error) {
                throw new Error('should not get here');
            }
        });
    });
});
