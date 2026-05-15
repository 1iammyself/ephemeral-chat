import { List } from 'immutable';
import * as reducerType from '../../unit/reducerType';
import { blankMatrix, lastRecord } from '../../unit/const';

const garbageRow = () => {
  const row = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  row[Math.floor(Math.random() * 10)] = 0;
  return List(row);
};

const initState = lastRecord && Array.isArray(lastRecord.matrix) ?
  List(lastRecord.matrix.map(e => List(e))) : blankMatrix;

const matrix = (state = initState, action) => {
  switch (action.type) {
    case reducerType.MATRIX:
      return action.data;
    case reducerType.ADD_GARBAGE: {
      const count = Math.min(Math.max(1, action.count), 4);
      let newMatrix = state;
      for (let i = 0; i < count; i++) {
        newMatrix = newMatrix.shift();
        newMatrix = newMatrix.push(garbageRow());
      }
      return newMatrix;
    }
    default:
      return state;
  }
};

export default matrix;
