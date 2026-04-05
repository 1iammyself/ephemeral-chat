use crate::Result;

pub struct HKDFDeriver;
impl HKDFDeriver {
    pub fn new(_ikm: &[u8], _salt: Option<&[u8]>) -> Self { todo!() }
    pub fn derive<const N: usize>(&self, _info: &[u8]) -> Result<[u8; N]> { todo!() }
    pub fn derive_var(&self, _info: &[u8], _output: &mut [u8]) -> Result<()> { todo!() }
}
