import clear from 'rollup-plugin-clear';
import copy from 'rollup-plugin-copy';
import screeps from 'rollup-plugin-screeps';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let config;

// 未指定 DEST 时只构建，不上传。
if (!process.env.DEST) {
    console.log('未指定目标，代码将被编译但不会上传');
} else {
    const secrets = require('./.secret.json');
    config = secrets[process.env.DEST];
    if (!config) {
        throw new Error('无效目标，请检查 .secret.json 中是否包含对应配置');
    }
}

const pluginDeploy = config && config.copyPath
    ? copy({
        targets: [
            {
                src: 'dist/main.js',
                dest: config.copyPath
            },
            {
                src: 'dist/main.js.map',
                dest: config.copyPath,
                rename: (name) => `${name}.map.js`,
                transform: (contents) => `module.exports = ${contents.toString()};`
            }
        ],
        hook: 'writeBundle',
        verbose: true
    })
    : screeps({ config, dryRun: !config });

function serviceVersionPlugin() {
    const serviceVersion = Date.now().toString();
    return {
        name: 'service-version',
        transform(code) {
            return {
                code: code.replaceAll('__SERVICE_VERSION__', serviceVersion),
                map: null
            };
        }
    };
}

export default {
    input: 'src/main.js',
    output: {
        file: 'dist/main.js',
        format: 'cjs',
        sourcemap: true
    },
    plugins: [
        serviceVersionPlugin(),
        clear({ targets: ['dist'] }),
        pluginDeploy
    ]
};
