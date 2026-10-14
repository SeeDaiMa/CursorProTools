function $Vr(t){const e=typeof t=="string"?t:Fo[t];return e.startsWith("ERROR_")?e.substring(6):e}
function $Fe(t,...e){if(t===void 0)return!1;const n=$Vr(t);return e.some(i=>$Vr(i)===n)}
function pCn(t){if(!t)return"generic";const e=t.error,n=t.details?.buttons,i=n?.some(o=>o.action?.case==="configureSpendLimit");if($Fe(e,Fo.USAGE_PRICING_REQUIRED,Fo.USAGE_PRICING_REQUIRED_CHANGEABLE))return"usage-limit-full";const r=$Fe(e,Fo.RATE_LIMITED_CHANGEABLE);return r&&i?"usage-limit-full":($Fe(e,Fo.RATE_LIMITED)||r)&&n?.some(a=>a.action?.case==="upgrade"||a.action?.case==="upgradeChoice")?"usage-limit-compact":"generic"}
function ija(t){return!t||t.details?.additionalInfo?.autoSwitchToModel||pCn(t)!=="generic"||!$Fe(t.error,Fo.RATE_LIMITED,Fo.RATE_LIMITED_CHANGEABLE)?!1:t.details?.buttons?.some(n=>n.action?.case==="switchModel")??!1}
function WVr(t){return t?.details?.additionalInfo?.autoSwitchToModel?!1:pCn(t)!=="generic"||ija(t)}
function HVr(t,e,n){if(!e)return;const i=n??qCS(e.data.fullConversationHeadersOnly);t.dismissBubbleError(e,i)}
function qCS(t){for(let e=t.length-1;e>=0;e--)if(t[e].type===xs.AI)return t[e].bubbleId}
function Mwf(t){for(let e=t.length-1;e>=0;e--)if(t[e].type===xs.AI)return t[e].bubbleId}
