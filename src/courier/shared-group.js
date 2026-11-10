// Supported existing commands only. ALL is a routing profile, never an order module.
const commands=['order','req','config_psb','mo','assuren','b2b','replacement'];
const moduleFor=command=>({order:'TIAL',req:'TIAL',config_psb:'LOGIC_PSB',mo:'LOGIC_MO',assuren:'ASSUREN',b2b:'B2B',replacement:'REPLACEMENT'})[command];
module.exports={commands,moduleFor};
