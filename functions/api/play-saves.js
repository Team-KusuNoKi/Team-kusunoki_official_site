import { handlePlaySave } from '../_lib/server/play-saves.js';

export const onRequest = context => handlePlaySave(context.request, context.env);
