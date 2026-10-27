import {MEMORY_PATH} from './decoder.mjs';
import {createProfileReader} from './profile-reader.mjs';

export const MEMORY_URL = 'https://screeps.com/api/user/memory?shard=shard3&path=' + MEMORY_PATH;
export const createMemoryReader = options => createProfileReader('economic_trial_v1', options);
