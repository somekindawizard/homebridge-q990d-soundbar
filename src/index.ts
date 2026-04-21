import { API } from 'homebridge';
import { Q990DPlatform } from './platform';

export = (api: API) => {
  api.registerPlatform('homebridge-q990d-soundbar', 'Q990DSoundbar', Q990DPlatform);
};
