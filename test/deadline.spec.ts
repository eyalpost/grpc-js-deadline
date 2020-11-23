import * as loader from '@grpc/proto-loader';
import * as grpcNative from 'grpc';
import {sendUnaryData, ServerUnaryCall} from 'grpc';
import * as grpcJs from '@grpc/grpc-js';
import * as chai from 'chai';
import * as chaiThings from 'chai-things';

chai.should();
const {expect} = chai.use(chaiThings);

const proto = loader.loadSync(require.resolve('../proto/service.proto'));

class ServiceImpl {

  calls: number = 0;

  constructor(private readonly client: any, private readonly mkMetadata: any) {
  }

  CallSelf(call: ServerUnaryCall<{delay: number}>, callback: sendUnaryData<{}>) {
    this.calls++;
    setTimeout(() => this.client.CallSelf({delay: call.request.delay}, this.mkMetadata(), {parent: call}, (err, result) => {
      callback(err, result);
    }), call.request.delay)
    ;
  };
}

describe('deadline', function () {

  this.timeout(20000);

  const suites = {
    'native': grpcNative,
    'js': grpcJs,
  };

  Object.keys(suites).forEach(label => {

    describe(label, () => {

      const {client, mkMetadata, service} = setup(suites[label]);

      it('does not allow more calls to be performed', done => {
        const numCalls = [];

        function next() {
          service.calls = 0;
          client.CallSelf({delay: 40, callNum: 1}, mkMetadata(), {deadline: Date.now() + 70}, (err, response) => {
            expect(err).to.have.property('message').that.matches(/DEADLINE/);
            setTimeout(() => {
              const calls = service.calls;
              if (calls >= 3) {
                console.log(calls);
              }
              numCalls.push(calls);
              if (numCalls.length === 10) {
                numCalls.should.all.be.lessThan(3);
                done();
              } else {
                setTimeout(next, 0);
              }
            }, 300)
          });
        };
        next();
      });
    });
  });

  function setup(grpc: any) {
    const packageDef = grpc.loadPackageDefinition(proto) as any;
    const mkMetadata = () => new grpc.Metadata();
    const server = new grpc.Server();
    const client = new packageDef.wix.Service('localhost:3001', grpc.credentials.createInsecure());
    const service = new ServiceImpl(client, mkMetadata);
    server.addService(packageDef.wix.Service.service, service);
    before(done => {
      server.bindAsync('0.0.0.0:3001', (grpc as any).ServerCredentials.createInsecure(), err => {
        if (err) {
          done(err);
        } else {
          server.start();
          done();
        }
      })
    });
    after(() => {
      server.forceShutdown();
    });

    return {client, mkMetadata, service};
  }
});
